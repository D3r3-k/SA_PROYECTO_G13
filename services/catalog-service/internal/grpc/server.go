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
			{MethodName: "ListAdminContent", Handler: s.listAdminHandler},
			{MethodName: "CreateContent", Handler: s.createContentHandler},
			{MethodName: "UpdateContent", Handler: s.updateContentHandler},
			{MethodName: "DeleteContent", Handler: s.deleteContentHandler},
			{MethodName: "SchedulePremiere", Handler: s.schedulePremiereHandler},
			{MethodName: "GenerateUploadUrl", Handler: s.generateUploadURLHandler},
			{MethodName: "ConfirmMedia", Handler: s.confirmMediaHandler},
			{MethodName: "ListAuditLogs", Handler: s.listAuditLogsHandler},
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
func i64(m *dynamicpb.Message, f string) int64 {
	return m.Get(m.Descriptor().Fields().ByName(protoreflect.Name(f))).Int()
}
func boolv(m *dynamicpb.Message, f string) bool {
	return m.Get(m.Descriptor().Fields().ByName(protoreflect.Name(f))).Bool()
}
func strList(m *dynamicpb.Message, f string) []string {
	list := m.Get(m.Descriptor().Fields().ByName(protoreflect.Name(f))).List()
	out := []string{}
	for i := 0; i < list.Len(); i++ {
		out = append(out, list.Get(i).String())
	}
	return out
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
func (s *Server) listAdminHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "ListAdminContentRequest")
	if err != nil {
		return nil, err
	}
	items, err := s.repo.ListAdmin(ctx, str(req, "type"), str(req, "status"), str(req, "query"), int(i32(req, "limit")), int(i32(req, "offset")))
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
func (s *Server) createContentHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "CreateContentRequest")
	if err != nil {
		return nil, err
	}
	result := s.svc.CreateAdminContent(ctx, catalogsvc.AdminContentInput{
		Type:          str(req, "type"),
		Title:         str(req, "title"),
		Overview:      str(req, "overview"),
		ReleaseDate:   str(req, "release_date"),
		AvailableFrom: str(req, "available_from"),
		ActorUserID:   str(req, "actor_user_id"),
		ActorEmail:    str(req, "actor_email"),
		Genres:        strList(req, "genres"),
		Cast:          s.adminCastInputs(req),
		Episodes:      s.adminEpisodeInputs(req),
	})
	res := s.newMsg("CreateContentResponse")
	setBool(res, "success", result.Success)
	setString(res, "message", result.Message)
	setString(res, "content_id", result.ContentID)
	list := res.Mutable(res.Descriptor().Fields().ByName("episodes")).List()
	for _, item := range result.Episodes {
		episode := s.newMsg("CreatedEpisode")
		setString(episode, "episode_id", item.EpisodeID)
		setInt32(episode, "season_number", int32(item.SeasonNumber))
		setInt32(episode, "episode_number", int32(item.EpisodeNumber))
		setString(episode, "title", item.Title)
		list.Append(protoreflect.ValueOfMessage(episode))
	}
	return res, nil
}
func (s *Server) updateContentHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "UpdateContentRequest")
	if err != nil {
		return nil, err
	}
	result := s.svc.UpdateAdminContent(ctx, catalogsvc.AdminContentInput{
		ContentID:     str(req, "content_id"),
		Type:          str(req, "type"),
		Title:         str(req, "title"),
		Overview:      str(req, "overview"),
		ReleaseDate:   str(req, "release_date"),
		AvailableFrom: str(req, "available_from"),
		ActorUserID:   str(req, "actor_user_id"),
		ActorEmail:    str(req, "actor_email"),
		Genres:        strList(req, "genres"),
		Cast:          s.adminCastInputs(req),
		Episodes:      s.adminEpisodeInputs(req),
	})
	res := s.newMsg("BasicCatalogResponse")
	setBool(res, "success", result.Success)
	setString(res, "message", result.Message)
	return res, nil
}
func (s *Server) deleteContentHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "DeleteContentRequest")
	if err != nil {
		return nil, err
	}
	result := s.svc.DeleteAdminContent(ctx, str(req, "content_id"), str(req, "actor_user_id"), str(req, "actor_email"))
	res := s.newMsg("BasicCatalogResponse")
	setBool(res, "success", result.Success)
	setString(res, "message", result.Message)
	return res, nil
}
func (s *Server) schedulePremiereHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "SchedulePremiereRequest")
	if err != nil {
		return nil, err
	}
	result := s.svc.SchedulePremiere(ctx, str(req, "content_id"), str(req, "available_from"), str(req, "actor_user_id"), str(req, "actor_email"))
	res := s.newMsg("BasicCatalogResponse")
	setBool(res, "success", result.Success)
	setString(res, "message", result.Message)
	return res, nil
}
func (s *Server) generateUploadURLHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "GenerateUploadUrlRequest")
	if err != nil {
		return nil, err
	}
	result, err := s.svc.GenerateUploadURL(catalogsvc.UploadURLRequest{
		ContentID:   str(req, "content_id"),
		EpisodeID:   str(req, "episode_id"),
		MediaType:   str(req, "media_type"),
		FileName:    str(req, "file_name"),
		ContentType: str(req, "content_type"),
		SizeBytes:   i64(req, "size_bytes"),
	})
	res := s.newMsg("GenerateUploadUrlResponse")
	if err != nil {
		setBool(res, "success", false)
		setString(res, "message", err.Error())
		return res, nil
	}
	setBool(res, "success", true)
	setString(res, "message", "upload url generated")
	setString(res, "upload_url", result.UploadURL)
	setString(res, "object_key", result.ObjectKey)
	setInt32(res, "expires_in_minutes", int32(result.ExpiresInMinutes))
	return res, nil
}
func (s *Server) confirmMediaHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "ConfirmMediaRequest")
	if err != nil {
		return nil, err
	}
	res := s.newMsg("BasicCatalogResponse")
	err = s.svc.ConfirmMedia(ctx, catalogsvc.ConfirmMediaInput{
		ContentID:   str(req, "content_id"),
		EpisodeID:   str(req, "episode_id"),
		MediaType:   str(req, "media_type"),
		ObjectKey:   str(req, "object_key"),
		ContentType: str(req, "content_type"),
		ActorUserID: str(req, "actor_user_id"),
		ActorEmail:  str(req, "actor_email"),
	})
	if err != nil {
		setBool(res, "success", false)
		setString(res, "message", err.Error())
		return res, nil
	}
	setBool(res, "success", true)
	setString(res, "message", "media confirmed")
	return res, nil
}


func (s *Server) listAuditLogsHandler(_ interface{}, ctx context.Context, dec func(interface{}) error, _ grpc.UnaryServerInterceptor) (interface{}, error) {
	req, err := s.decode(ctx, dec, "ListAuditLogsRequest")
	if err != nil {
		return nil, err
	}
	items, err := s.repo.ListAuditLogs(ctx, str(req, "table_name"), str(req, "actor_user_id"), str(req, "action"), str(req, "from"), str(req, "to"), int(i32(req, "limit")), int(i32(req, "offset")))
	res := s.newMsg("ListAuditLogsResponse")
	if err != nil {
		setBool(res, "success", false)
		setString(res, "message", err.Error())
		return res, nil
	}
	setBool(res, "success", true)
	setString(res, "message", fmt.Sprintf("audit logs listed: %d items", len(items)))
	list := res.Mutable(res.Descriptor().Fields().ByName("items")).List()
	for _, item := range items {
		list.Append(protoreflect.ValueOfMessage(s.auditLogMessage(item)))
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
	setString(m, "poster_path", s.svc.ResolveReadURL(item.PosterPath))
	setString(m, "release_date", item.ReleaseDate)
	setString(m, "media_url", s.svc.ResolveReadURL(item.MediaURL))
	setString(m, "media_mime_type", item.MediaMimeType)
	setString(m, "source_page_url", item.SourcePageURL)
	setInt32(m, "seasons_count", int32(item.SeasonsCount))
	setInt32(m, "episodes_count", int32(item.EpisodesCount))
	setString(m, "available_from", item.AvailableFrom)
	setString(m, "deleted_at", item.DeletedAt)
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
	setString(m, "media_url", s.svc.ResolveReadURL(e.MediaURL))
	setString(m, "media_mime_type", e.MediaMimeType)
	return m
}

func (s *Server) auditLogMessage(item repository.AuditLog) protoreflect.Message {
	m := s.newMsg("AuditLogItem")
	setString(m, "service", "catalog")
	setString(m, "audit_id", item.ID)
	setString(m, "actor_user_id", item.ActorUserID)
	setString(m, "actor_email", item.ActorEmail)
	setString(m, "action", item.Action)
	setString(m, "table_name", item.TableName)
	setString(m, "record_id", item.RecordID)
	setString(m, "old_state_json", item.OldState)
	setString(m, "new_state_json", item.NewState)
	setString(m, "created_at", item.CreatedAt)
	return m
}

func (s *Server) adminCastInputs(req *dynamicpb.Message) []catalogsvc.AdminCastInput {
	field := req.Descriptor().Fields().ByName("cast")
	list := req.Get(field).List()
	out := []catalogsvc.AdminCastInput{}
	for i := 0; i < list.Len(); i++ {
		msg := list.Get(i).Message()
		out = append(out, catalogsvc.AdminCastInput{
			ActorName:     msg.Get(msg.Descriptor().Fields().ByName("actor_name")).String(),
			CharacterName: msg.Get(msg.Descriptor().Fields().ByName("character_name")).String(),
			OrderIndex:    int(msg.Get(msg.Descriptor().Fields().ByName("order_index")).Int()),
		})
	}
	return out
}

func (s *Server) adminEpisodeInputs(req *dynamicpb.Message) []catalogsvc.AdminEpisodeInput {
	field := req.Descriptor().Fields().ByName("episodes")
	list := req.Get(field).List()
	out := []catalogsvc.AdminEpisodeInput{}
	for i := 0; i < list.Len(); i++ {
		msg := list.Get(i).Message()
		out = append(out, catalogsvc.AdminEpisodeInput{
			SeasonNumber:   int(msg.Get(msg.Descriptor().Fields().ByName("season_number")).Int()),
			EpisodeNumber:  int(msg.Get(msg.Descriptor().Fields().ByName("episode_number")).Int()),
			Title:          msg.Get(msg.Descriptor().Fields().ByName("title")).String(),
			Overview:       msg.Get(msg.Descriptor().Fields().ByName("overview")).String(),
			RuntimeMinutes: int(msg.Get(msg.Descriptor().Fields().ByName("runtime_minutes")).Int()),
		})
	}
	return out
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
	tI64 := descriptorpb.FieldDescriptorProto_TYPE_INT64
	tMsg := descriptorpb.FieldDescriptorProto_TYPE_MESSAGE
	file := &descriptorpb.FileDescriptorProto{Syntax: strPtr("proto3"), Name: strPtr("catalog.proto"), Package: strPtr("catalog"), MessageType: []*descriptorpb.DescriptorProto{
		msg("CatalogHealthRequest"),
		msg("CatalogHealthResponse", field("success", 1, tBool, opt, ""), field("status", 2, tStr, opt, ""), field("database", 3, tBool, opt, "")),
		msg("SyncMinimumCatalogRequest", field("force", 1, tBool, opt, "")),
		msg("SyncMinimumCatalogResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, ""), field("contents_synced", 3, tI32, opt, ""), field("episodes_synced", 4, tI32, opt, ""), field("provider", 5, tStr, opt, "")),
		msg("ListContentRequest", field("type", 1, tStr, opt, ""), field("genre", 2, tStr, opt, ""), field("limit", 3, tI32, opt, ""), field("offset", 4, tI32, opt, "")),
		msg("SearchContentRequest", field("query", 1, tStr, opt, ""), field("type", 2, tStr, opt, ""), field("genre", 3, tStr, opt, ""), field("limit", 4, tI32, opt, ""), field("offset", 5, tI32, opt, "")),
		msg("ListAdminContentRequest", field("type", 1, tStr, opt, ""), field("status", 2, tStr, opt, ""), field("query", 3, tStr, opt, ""), field("limit", 4, tI32, opt, ""), field("offset", 5, tI32, opt, "")),
		msg("GetContentDetailRequest", field("content_id", 1, tStr, opt, "")),
		msg("ListEpisodesRequest", field("content_id", 1, tStr, opt, ""), field("season_number", 2, tI32, opt, "")),
		msg("Genre", field("name", 1, tStr, opt, "")),
		msg("CastMember", field("actor_name", 1, tStr, opt, ""), field("character_name", 2, tStr, opt, ""), field("order_index", 3, tI32, opt, "")),
		msg("ContentCard", field("content_id", 1, tStr, opt, ""), field("external_id", 2, tStr, opt, ""), field("type", 3, tStr, opt, ""), field("title", 4, tStr, opt, ""), field("overview", 5, tStr, opt, ""), field("poster_path", 6, tStr, opt, ""), field("release_date", 7, tStr, opt, ""), field("genres", 8, tMsg, rep, ".catalog.Genre"), field("media_url", 9, tStr, opt, ""), field("media_mime_type", 10, tStr, opt, ""), field("source_page_url", 11, tStr, opt, ""), field("seasons_count", 12, tI32, opt, ""), field("episodes_count", 13, tI32, opt, ""), field("available_from", 14, tStr, opt, ""), field("deleted_at", 15, tStr, opt, "")),
		msg("ContentDetailResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, ""), field("content", 3, tMsg, opt, ".catalog.ContentCard"), field("cast", 4, tMsg, rep, ".catalog.CastMember"), field("seasons_count", 5, tI32, opt, ""), field("episodes_count", 6, tI32, opt, "")),
		msg("ListContentResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, ""), field("items", 3, tMsg, rep, ".catalog.ContentCard")),
		msg("Episode", field("episode_id", 1, tStr, opt, ""), field("content_id", 2, tStr, opt, ""), field("season_number", 3, tI32, opt, ""), field("episode_number", 4, tI32, opt, ""), field("title", 5, tStr, opt, ""), field("overview", 6, tStr, opt, ""), field("runtime_minutes", 7, tI32, opt, ""), field("media_url", 8, tStr, opt, ""), field("media_mime_type", 9, tStr, opt, "")),
		msg("ListEpisodesResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, ""), field("episodes", 3, tMsg, rep, ".catalog.Episode")),
		msg("AdminCastInput", field("actor_name", 1, tStr, opt, ""), field("character_name", 2, tStr, opt, ""), field("order_index", 3, tI32, opt, "")),
		msg("AdminEpisodeInput", field("season_number", 1, tI32, opt, ""), field("episode_number", 2, tI32, opt, ""), field("title", 3, tStr, opt, ""), field("overview", 4, tStr, opt, ""), field("runtime_minutes", 5, tI32, opt, "")),
		msg("CreateContentRequest", field("type", 1, tStr, opt, ""), field("title", 2, tStr, opt, ""), field("overview", 3, tStr, opt, ""), field("release_date", 4, tStr, opt, ""), field("genres", 5, tStr, rep, ""), field("cast", 6, tMsg, rep, ".catalog.AdminCastInput"), field("episodes", 7, tMsg, rep, ".catalog.AdminEpisodeInput"), field("available_from", 8, tStr, opt, ""), field("actor_user_id", 9, tStr, opt, ""), field("actor_email", 10, tStr, opt, "")),
		msg("UpdateContentRequest", field("content_id", 1, tStr, opt, ""), field("title", 2, tStr, opt, ""), field("overview", 3, tStr, opt, ""), field("release_date", 4, tStr, opt, ""), field("genres", 5, tStr, rep, ""), field("cast", 6, tMsg, rep, ".catalog.AdminCastInput"), field("episodes", 7, tMsg, rep, ".catalog.AdminEpisodeInput"), field("available_from", 8, tStr, opt, ""), field("actor_user_id", 9, tStr, opt, ""), field("actor_email", 10, tStr, opt, ""), field("type", 11, tStr, opt, "")),
		msg("DeleteContentRequest", field("content_id", 1, tStr, opt, ""), field("actor_user_id", 2, tStr, opt, ""), field("actor_email", 3, tStr, opt, "")),
		msg("SchedulePremiereRequest", field("content_id", 1, tStr, opt, ""), field("available_from", 2, tStr, opt, ""), field("actor_user_id", 3, tStr, opt, ""), field("actor_email", 4, tStr, opt, "")),
		msg("CreatedEpisode", field("episode_id", 1, tStr, opt, ""), field("season_number", 2, tI32, opt, ""), field("episode_number", 3, tI32, opt, ""), field("title", 4, tStr, opt, "")),
		msg("CreateContentResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, ""), field("content_id", 3, tStr, opt, ""), field("episodes", 4, tMsg, rep, ".catalog.CreatedEpisode")),
		msg("GenerateUploadUrlRequest", field("content_id", 1, tStr, opt, ""), field("episode_id", 2, tStr, opt, ""), field("media_type", 3, tStr, opt, ""), field("file_name", 4, tStr, opt, ""), field("content_type", 5, tStr, opt, ""), field("size_bytes", 6, tI64, opt, "")),
		msg("GenerateUploadUrlResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, ""), field("upload_url", 3, tStr, opt, ""), field("object_key", 4, tStr, opt, ""), field("expires_in_minutes", 5, tI32, opt, "")),
		msg("ConfirmMediaRequest", field("content_id", 1, tStr, opt, ""), field("episode_id", 2, tStr, opt, ""), field("media_type", 3, tStr, opt, ""), field("object_key", 4, tStr, opt, ""), field("content_type", 5, tStr, opt, ""), field("actor_user_id", 6, tStr, opt, ""), field("actor_email", 7, tStr, opt, "")),
		msg("BasicCatalogResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, "")),
		msg("AuditLogItem", field("service", 1, tStr, opt, ""), field("audit_id", 2, tStr, opt, ""), field("actor_user_id", 3, tStr, opt, ""), field("actor_email", 4, tStr, opt, ""), field("action", 5, tStr, opt, ""), field("table_name", 6, tStr, opt, ""), field("record_id", 7, tStr, opt, ""), field("old_state_json", 8, tStr, opt, ""), field("new_state_json", 9, tStr, opt, ""), field("created_at", 10, tStr, opt, "")),
		msg("ListAuditLogsRequest", field("table_name", 1, tStr, opt, ""), field("actor_user_id", 2, tStr, opt, ""), field("action", 3, tStr, opt, ""), field("from", 4, tStr, opt, ""), field("to", 5, tStr, opt, ""), field("limit", 6, tI32, opt, ""), field("offset", 7, tI32, opt, "")),
		msg("ListAuditLogsResponse", field("success", 1, tBool, opt, ""), field("message", 2, tStr, opt, ""), field("items", 3, tMsg, rep, ".catalog.AuditLogItem")),
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
