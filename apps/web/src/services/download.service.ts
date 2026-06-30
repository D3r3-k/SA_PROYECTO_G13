import api from './api'

export interface DownloadGrantEpisode {
  episode_id: string
  season_number: number
  episode_number: number
  title: string
  runtime_minutes: number
}

export interface DownloadGrant {
  content_id: string
  title: string
  type: string
  maturity_rating: string
  media_url: string
  media_mime_type: string
  poster_path: string
  source_page_url: string
  authorized_at: string
  expires_at: string
  episode?: DownloadGrantEpisode
}

export interface DownloadGrantResponse {
  success: boolean
  message: string
  grant: DownloadGrant
}

function parentalPinHeaders(parentalPin?: string) {
  return parentalPin ? { 'X-Parental-Pin': parentalPin } : undefined
}

export const downloadService = {
  requestMovieDownload: (contentId: string, parentalPin?: string) =>
    api.get<DownloadGrantResponse>(`/catalog/${contentId}/download`, {
      headers: parentalPinHeaders(parentalPin),
    }),

  requestEpisodeDownload: (
    contentId: string,
    episodeId: string,
    seasonNumber: number,
    parentalPin?: string,
  ) =>
    api.get<DownloadGrantResponse>(`/catalog/${contentId}/episodes/${episodeId}/download`, {
      params: { season_number: seasonNumber },
      headers: parentalPinHeaders(parentalPin),
    }),
}
