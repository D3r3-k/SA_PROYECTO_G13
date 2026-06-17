import api from './api'

export interface RatingSummary {
  content_id: string
  total_ratings: number
  thumbs_up_count: number
  thumbs_down_count: number
  recommendation_percentage: number
}

export interface HistoryItem {
  profile_id: string
  content_id: string
  season_number: number
  episode_number: number
  minute: number
  updated_at: unknown
}

export interface GetHistoryResponse {
  items: HistoryItem[]
}

export interface ResumeResponse {
  found: boolean
  profile_id: string
  content_id: string
  season_number: number
  episode_number: number
  minute: number
  updated_at: unknown
}

export const engagementService = {
  rate: (contentId: string, profileId: string, rating: 'THUMBS_UP' | 'THUMBS_DOWN') =>
    api.post(`/engagement/content/${contentId}/rating`, {
      profile_id: profileId,
      rating,
    }),

  getRatingSummary: (contentId: string) =>
    api.get<RatingSummary>(`/engagement/content/${contentId}/rating-summary`),

  saveProgress: (
    contentId: string,
    profileId: string,
    minute: number,
    seasonNumber = 0,
    episodeNumber = 0,
  ) =>
    api.post(`/engagement/content/${contentId}/progress`, {
      profile_id: profileId,
      season_number: seasonNumber,
      episode_number: episodeNumber,
      minute,
    }),

  getHistory: (profileId: string, limit = 10) =>
    api.get<GetHistoryResponse>(`/engagement/profiles/${profileId}/history`, {
      params: { limit },
    }),

  resume: (contentId: string, profileId: string) =>
    api.get<ResumeResponse>(`/engagement/content/${contentId}/resume`, {
      params: { profile_id: profileId },
    }),
}
