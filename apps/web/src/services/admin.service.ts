import adminApi from './adminApi'

export type ContentType = 'movie' | 'series'
export type MediaType = 'poster' | 'movie_video' | 'episode_video'
export type AdminContentStatus = 'all' | 'visible' | 'scheduled' | 'deleted'
export type AuditService = 'all' | 'catalog' | 'identity' | 'subscription' | 'engagement'

export interface Plan {
  id: number
  name: string
  price_usd: number
  is_active: boolean
}

export interface PlanResponse {
  success?: boolean
  message?: string
  plans: Plan[]
}

export interface SyncResult {
  success: boolean
  message: string
  contents_synced?: number
  episodes_synced?: number
  provider?: string
}

export interface Genre {
  name: string
}

export interface AdminContentItem {
  content_id: string
  external_id: string
  type: ContentType | string
  title: string
  overview: string
  poster_path: string
  release_date: string
  available_from: string
  deleted_at: string
  genres: Genre[]
  media_url: string
  media_mime_type: string
  source_page_url: string
  seasons_count: number
  episodes_count: number
}

export interface AdminContentListResponse {
  success: boolean
  message: string
  items: AdminContentItem[]
}

export interface CastInput {
  actorName: string
  characterName: string
  orderIndex: number
}

export interface EpisodeInput {
  seasonNumber: number
  episodeNumber: number
  title: string
  overview: string
  runtimeMinutes: number
}

export interface ContentWritePayload {
  type: ContentType
  title: string
  overview: string
  releaseDate: string
  availableFrom: string
  genres: string[]
  cast: CastInput[]
  episodes: EpisodeInput[]
}

export interface CreatedEpisode {
  episode_id: string
  season_number: number
  episode_number: number
  title: string
}

export interface CreateContentResponse {
  success: boolean
  message: string
  content_id: string
  episodes: CreatedEpisode[]
}

export interface BasicAdminResponse {
  success: boolean
  message: string
}

export interface UploadUrlResponse {
  success: boolean
  message: string
  upload_url: string
  object_key: string
  expires_in_minutes: number
}

export interface AuditLogItem {
  service: string
  audit_id: string
  actor_user_id: string
  actor_email: string
  action: string
  table_name: string
  record_id: string
  old_state_json: string
  new_state_json: string
  created_at: string
}

export interface AuditResponse {
  success: boolean
  message: string
  items: AuditLogItem[]
}

export interface AuditFilters {
  service: AuditService
  table_name?: string
  actor_user_id?: string
  action?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

function cleanParams<T extends object>(params: T) {
  return Object.fromEntries(
    Object.entries(params as Record<string, unknown>).filter(([, value]) => value !== '' && value !== undefined && value !== null),
  )
}

export const adminService = {
  listPlans: () => adminApi.get<PlanResponse>('/plans'),

  updatePlan: (planId: number, payload: { name: string; price_usd: number }) =>
    adminApi.patch<BasicAdminResponse>(`/plans/${planId}`, payload),

  syncCatalog: (force: boolean) => adminApi.post<SyncResult>('/catalog/sync', { force }),

  listContent: (params: {
    type?: string
    status?: AdminContentStatus
    query?: string
    limit?: number
    offset?: number
  }) => adminApi.get<AdminContentListResponse>('/catalog/content', { params: cleanParams(params) }),

  createContent: (payload: ContentWritePayload) =>
    adminApi.post<CreateContentResponse>('/catalog/content', payload),

  updateContent: (contentId: string, payload: ContentWritePayload) =>
    adminApi.patch<BasicAdminResponse>(`/catalog/content/${contentId}`, payload),

  deleteContent: (contentId: string) =>
    adminApi.delete<BasicAdminResponse>(`/catalog/content/${contentId}`),

  schedulePremiere: (contentId: string, availableFrom: string) =>
    adminApi.patch<BasicAdminResponse>(`/catalog/content/${contentId}/premiere`, { availableFrom }),

  generateUploadUrl: (payload: {
    contentId: string
    episodeId?: string
    mediaType: MediaType
    fileName: string
    contentType: string
    sizeBytes: number
  }) => adminApi.post<UploadUrlResponse>('/media/upload-url', payload),

  confirmMedia: (payload: {
    contentId: string
    episodeId?: string
    mediaType: MediaType
    objectKey: string
    contentType: string
  }) => adminApi.post<BasicAdminResponse>('/media/confirm', payload),

  listAudit: (filters: AuditFilters) =>
    adminApi.get<AuditResponse>('/audit', { params: cleanParams(filters) }),

  downloadAuditCsv: (filters: AuditFilters) =>
    adminApi.get<Blob>('/audit.csv', { params: cleanParams(filters), responseType: 'blob' }),

  downloadAuditPdf: (filters: AuditFilters) =>
    adminApi.get<Blob>('/audit.pdf', { params: cleanParams(filters), responseType: 'blob' }),
}
