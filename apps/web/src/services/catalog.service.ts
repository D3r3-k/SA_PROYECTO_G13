import api from './api'

export interface Genre {
  name: string
}

export interface ContentCard {
  content_id: string
  external_id: string
  type: string
  title: string
  overview: string
  poster_path: string
  release_date: string
  genres: Genre[]
  media_url: string
  media_mime_type: string
  source_page_url: string
  seasons_count: number
  episodes_count: number
  available_from: string
  deleted_at: string
}

export interface CastMember {
  actor_name: string
  character_name: string
  order_index: number
}

export interface ContentDetail {
  success: boolean
  message: string
  content: ContentCard
  cast: CastMember[]
  seasons_count: number
  episodes_count: number
}

export interface Episode {
  episode_id: string
  content_id: string
  season_number: number
  episode_number: number
  title: string
  overview: string
  runtime_minutes: number
  media_url: string
  media_mime_type: string
}

export interface ListContentResponse {
  success: boolean
  message: string
  items: ContentCard[]
}

export interface ListEpisodesResponse {
  success: boolean
  message: string
  episodes: Episode[]
}

export const catalogService = {
  list: (type?: string, genre?: string) =>
    api.get<ListContentResponse>('/catalog', {
      params: {
        ...(type && type !== 'all' ? { type } : {}),
        ...(genre && genre !== 'Todos' ? { genre } : {}),
      },
    }),

  search: (query: string, type?: string, genre?: string, limit = 20, offset = 0) =>
    api.get<ListContentResponse>('/catalog/search', {
      params: {
        q: query,
        ...(type && type !== 'all' ? { type } : {}),
        ...(genre && genre !== 'Todos' ? { genre } : {}),
        limit,
        offset,
      },
    }),

  detail: (contentId: string) =>
    api.get<ContentDetail>(`/catalog/${contentId}`),

  episodes: (contentId: string, seasonNumber = 1) =>
    api.get<ListEpisodesResponse>(`/catalog/${contentId}/episodes`, {
      params: { season_number: seasonNumber },
    }),
}
