package grpcserver

import (
	"context"
	"fmt"
	"net"

	"google.golang.org/grpc"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
	"quetxaltv/catalog-service/internal/repository"
	catalogsvc "quetxaltv/catalog-service/internal/service"
)

type Server struct {
	grpcServer *grpc.Server
	svc        catalogsvc.Service
	repo       repository.Repository
	descs      map[string]protoreflect.MessageDescriptor
}

func New(repo repository.Repository, svc catalogsvc.Service) (*Server, error) {
	descs, err := buildDescriptors()
	if err != nil {
		return nil, err
	}
	s := &Server{grpcServer: grpc.NewServer(), repo: repo, svc: svc, descs: descs}
	s.grpcServer.RegisterService(&grpc.ServiceDesc{
		ServiceName: "catalog.CatalogService",
		HandlerType: (*interface{})(nil),
		Methods: []grpc.MethodDesc{
			{MethodName: "Health", Handler: s.healthHandler},
			{MethodName: "SyncMinimumCatalog", Handler: s.syncHandler},
			{MethodName: "ListContent", Handler: s.listHandler},
			{MethodName: "SearchContent", Handler: s.searchHandler},
			{MethodName: "GetContentDetail", Handler: s.detailHandler},
			{MethodName: "ListEpisodes", Handler: s.episodesHandler},
		},
	}, s)
	return s, nil
}

func (s *Server) Serve(port string) error {
	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		return err
	}
	return s.grpcServer.Serve(lis)
}

func (s *Server) newMsg(name string) *dynamicpb.Message { return dynamicpb.NewMessage(s.descs[name]) }
func str(m *dynamicpb.Message, f string) string {
	return m.Get(m.Descriptor().Fields().ByName(protoreflect.Name(f))).String()
}
func i32(m *dynamicpb.Message, f string) int32 {
	return int32(m.Get(m.Descriptor().Fields().ByName(protoreflect.Name(f))).Int())
}
func boolv(m *dynamicpb.Message, f string) bool {
	return m.Get(m.Descriptor().Fields().ByName(protoreflect.Name(f))).Bool()
}
func setString(m *dynamicpb.Message, f string, v string) {
	m.Set(m.Descriptor().Fields().ByName(protoreflect.Name(f)), protoreflect.ValueOfString(v))
}
func setBool(m *dynamicpb.Message, f string, v bool) {
	m.Set(m.Descriptor().Fields().ByName(protoreflect.Name(f)), protoreflect.ValueOfBool(v))
}
func setInt32(m *dynamicpb.Message, f string, v int32) {
	m.Set(m.Descriptor().Fields().ByName(protoreflect.Name(f)), protoreflect.ValueOfInt32(v))
}

func (s *Server) decode(ctx context.Context, dec func(interface{}) error, name string) (*dynamicpb.Message, error) {
	req := s.newMsg(name)
	return req, dec(req)
}
func (s *Server) healthHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	_, _ = s.decode(ctx, dec, "CatalogHealthRequest")
	res := s.newMsg("CatalogHealthResponse")
	err := s.repo.Ping(ctx)
	setBool(res, "success", err == nil)
	if err == nil {
		setString(res, "status", "ok")
		setBool(res, "database", true)
	} else {
		setString(res, "status", "degraded")
		setBool(res, "database", false)
	}
	return res, nil
}
func (s *Server) syncHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "SyncMinimumCatalogRequest")
	if err != nil {
		return nil, err
	}
	result := s.svc.SyncMinimum(ctx, boolv(req, "force"))
	res := s.newMsg("SyncMinimumCatalogResponse")
	setBool(res, "success", result.Success)
	setString(res, "message", result.Message)
	setInt32(res, "contents_synced", int32(result.Contents))
	setInt32(res, "episodes_synced", int32(result.Episodes))
	setString(res, "provider", result.Provider)
	return res, nil
}
func (s *Server) listHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "ListContentRequest")
	if err != nil {
		return nil, err
	}
	items, err := s.repo.List(ctx, str(req, "type"), str(req, "genre"), "", int(i32(req, "limit")), int(i32(req, "offset")))
	return s.contentListResponse(items, err), nil
}
func (s *Server) searchHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "SearchContentRequest")
	if err != nil {
		return nil, err
	}
	items, err := s.repo.List(ctx, str(req, "type"), str(req, "genre"), str(req, "query"), int(i32(req, "limit")), int(i32(req, "offset")))
	return s.contentListResponse(items, err), nil
}
func (s *Server) detailHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "GetContentDetailRequest")
	if err != nil {
		return nil, err
	}
	detail, found, err := s.repo.Detail(ctx, str(req, "content_id"))
	res := s.newMsg("ContentDetailResponse")
	if err != nil {
		setBool(res, "success", false)
		setString(res, "message", err.Error())
		return res, nil
	}
	if !found {
		setBool(res, "success", false)
		setString(res, "message", "content not found")
		return res, nil
	}
	setBool(res, "success", true)
	setString(res, "message", "content detail resolved")
	res.Set(res.Descriptor().Fields().ByName("content"), protoreflect.ValueOfMessage(s.cardMessage(detail.Content)))
	castList := res.Mutable(res.Descriptor().Fields().ByName("cast")).List()
	for _, c := range detail.Cast {
		castList.Append(protoreflect.ValueOfMessage(s.castMessage(c)))
	}
	setInt32(res, "seasons_count", int32(detail.Content.SeasonsCount))
	setInt32(res, "episodes_count", int32(detail.Content.EpisodesCount))
	return res, nil
}
func (s *Server) episodesHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "ListEpisodesRequest")
	if err != nil {
		return nil, err
	}
	items, err := s.repo.Episodes(ctx, str(req, "content_id"), int(i32(req, "season_number")))
	res := s.newMsg("ListEpisodesResponse")
	if err != nil {
		setBool(res, "success", false)
		setString(res, "message", err.Error())
		return res, nil
	}
	setBool(res, "success", true)
	setString(res, "message", "episodes listed")
	list := res.Mutable(res.Descriptor().Fields().ByName("episodes")).List()
	for _, e := range items {
		list.Append(protoreflect.ValueOfMessage(s.episodeMessage(e)))
	}
	return res, nil
}

func (s *Server) contentListResponse(items []repository.ContentCard, err error) *dynamicpb.Message {
	res := s.newMsg("ListContentResponse")
	if err != nil {
		setBool(res, "success", false)
		setString(res, "message", err.Error())
		return res
	}
	setBool(res, "success", true)
	setString(res, "message", fmt.Sprintf("content listed: %d items", len(items)))
	list := res.Mutable(res.Descriptor().Fields().ByName("items")).List()
	for _, item := range items {
		list.Append(protoreflect.ValueOfMessage(s.cardMessage(item)))
	}
	return res
}
func (s *Server) cardMessage(item repository.ContentCard) protoreflect.Message {
	m := s.newMsg("ContentCard")
	setString(m, "content_id", item.ContentID)
	setString(m, "external_id", item.ExternalID)
	setString(m, "type", item.Type)
	setString(m, "title", item.Title)
	setString(m, "overview", item.Overview)
	setString(m, "poster_path", item.PosterPath)
	setString(m, "release_date", item.ReleaseDate)
	setString(m, "media_url", item.MediaURL)
	setString(m, "media_mime_type", item.MediaMimeType)
	setString(m, "source_page_url", item.SourcePageURL)
	setInt32(m, "seasons_count", int32(item.SeasonsCount))
	setInt32(m, "episodes_count", int32(item.EpisodesCount))
	list := m.Mutable(m.Descriptor().Fields().ByName("genres")).List()
	for _, g := range item.Genres {
		gm := s.newMsg("Genre")
		setString(gm, "name", g)
		list.Append(protoreflect.ValueOfMessage(gm))
	}
	return m
}
func (s *Server) castMessage(c repository.CastMember) protoreflect.Message {
	m := s.newMsg("CastMember")
	setString(m, "actor_name", c.ActorName)
	setString(m, "character_name", c.CharacterName)
	setInt32(m, "order_index", int32(c.OrderIndex))
	return m
}
func (s *Server) episodeMessage(e repository.Episode) protoreflect.Message {
	m := s.newMsg("Episode")
	setString(m, "episode_id", e.EpisodeID)
	setString(m, "content_id", e.ContentID)
	setInt32(m, "season_number", int32(e.SeasonNumber))
	setInt32(m, "episode_number", int32(e.EpisodeNumber))
	setString(m, "title", e.Title)
	setString(m, "overview", e.Overview)
	setInt32(m, "runtime_minutes", int32(e.RuntimeMinutes))
	setString(m, "media_url", e.MediaURL)
	setString(m, "media_mime_type", e.MediaMimeType)
	return m
}

func buildDescriptors() (map[string]protoreflect.MessageDescriptor, error) {
	strPtr := func(s string) *string { return &s }
	i32Ptr := func(i int32) *int32 { return &i }
	field := func(name string, num int32, typ descriptorpb.FieldDescriptorProto_Type, label descriptorpb.FieldDescriptorProto_Label, typeName string) *descriptorpb.FieldDescriptorProto {
		f := &descriptorpb.FieldDescriptorProto{Name: strPtr(name), Number: i32Ptr(num), Label: &label, Type: &typ}
		if typeName != "" {
			f.TypeName = strPtr(typeName)
		}
		return f
	}
	msg := func(name string, fields ...*descriptorpb.FieldDescriptorProto) *descriptorpb.DescriptorProto {
		return &descriptorpb.DescriptorProto{Name: strPtr(name), Field: fields}
	}
	opt := descriptorpb.FieldDescriptorProto_LABEL_OPTIONAL
	rep := descriptorpb.FieldDescriptorProto_LABEL_REPEATED
	tStr := descriptorpb.FieldDescriptorProto_TYPE_STRING
	tBool := descriptorpb.FieldDescriptorProto_TYPE_BOOL
	tI32 := descriptorpb.FieldDescriptorProto_TYPE_INT32
	tMsg := descriptorpb.FieldDescriptorProto_TYPE_MESSAGE
	file := &descriptorpb.FileDescriptorProto{Syntax: strPtr("proto3"), Name: strPtr("catalog.proto"), Package: strPtr("catalog"), MessageType: []*descriptorpb.DescriptorProto{
		msg("CatalogHealthRequest"), msg("CatalogHealthResponse", field("success", 1, tBool, opt, ""), field("status", 2, tStr, opt, ""), field("database", 3, tBool, opt, "")),
		msg("SyncMinimumCatalogRequest", field("force", 1, tBool, opt, "")), msg("SyncMinimumCatalogResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, ""), field("contents_synced", 3, tI32, opt, ""), field("episodes_synced", 4, tI32, opt, ""), field("provider", 5, tStr, opt, "")),
		msg("ListContentRequest", field("type", 1, tStr, opt, ""), field("genre", 2, tStr, opt, ""), field("limit", 3, tI32, opt, ""), field("offset", 4, tI32, opt, "")),
		msg("SearchContentRequest", field("query", 1, tStr, opt, ""), field("type", 2, tStr, opt, ""), field("genre", 3, tStr, opt, ""), field("limit", 4, tI32, opt, ""), field("offset", 5, tI32, opt, "")),
		msg("GetContentDetailRequest", field("content_id", 1, tStr, opt, "")), msg("ListEpisodesRequest", field("content_id", 1, tStr, opt, ""), field("season_number", 2, tI32, opt, "")),
		msg("Genre", field("name", 1, tStr, opt, "")), msg("CastMember", field("actor_name", 1, tStr, opt, ""), field("character_name", 2, tStr, opt, ""), field("order_index", 3, tI32, opt, "")),
		msg("ContentCard", field("content_id", 1, tStr, opt, ""), field("external_id", 2, tStr, opt, ""), field("type", 3, tStr, opt, ""), field("title", 4, tStr, opt, ""), field("overview", 5, tStr, opt, ""), field("poster_path", 6, tStr, opt, ""), field("release_date", 7, tStr, opt, ""), field("genres", 8, tMsg, rep, ".catalog.Genre"), field("media_url", 9, tStr, opt, ""), field("media_mime_type", 10, tStr, opt, ""), field("source_page_url", 11, tStr, opt, ""), field("seasons_count", 12, tI32, opt, ""), field("episodes_count", 13, tI32, opt, "")),
		msg("ContentDetailResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, ""), field("content", 3, tMsg, opt, ".catalog.ContentCard"), field("cast", 4, tMsg, rep, ".catalog.CastMember"), field("seasons_count", 5, tI32, opt, ""), field("episodes_count", 6, tI32, opt, "")),
		msg("ListContentResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, ""), field("items", 3, tMsg, rep, ".catalog.ContentCard")),
		msg("Episode", field("episode_id", 1, tStr, opt, ""), field("content_id", 2, tStr, opt, ""), field("season_number", 3, tI32, opt, ""), field("episode_number", 4, tI32, opt, ""), field("title", 5, tStr, opt, ""), field("overview", 6, tStr, opt, ""), field("runtime_minutes", 7, tI32, opt, ""), field("media_url", 8, tStr, opt, ""), field("media_mime_type", 9, tStr, opt, "")),
		msg("ListEpisodesResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, ""), field("episodes", 3, tMsg, rep, ".catalog.Episode")),
	}}
	fd, err := protodesc.NewFile(file, nil)
	if err != nil {
		return nil, fmt.Errorf("catalog descriptor error: %w", err)
	}
	out := map[string]protoreflect.MessageDescriptor{}
	for i := 0; i < fd.Messages().Len(); i++ {
		d := fd.Messages().Get(i)
		out[string(d.Name())] = d
	}
	return out, nil
}
