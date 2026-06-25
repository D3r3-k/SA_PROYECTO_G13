import api from './api'

export interface WatchPartyRoom {
  code: string
  host_user_id: string
  host_profile_id: string
  content_id: string
  created_at: string
  participants_count: number
  playback: {
    action: 'play' | 'pause' | 'seek'
    position: number
    updated_at: string
  }
}

export const watchPartyService = {
  createRoom: (contentId: string) =>
    api.post<{ success: boolean; message: string; code: string; room: WatchPartyRoom; join_url: string; ws_path: string }>(
      '/watch-party/rooms',
      { content_id: contentId },
    ),

  getRoom: (code: string) =>
    api.get<{ success: boolean; message: string; room: WatchPartyRoom; is_host: boolean }>(
      `/watch-party/rooms/${code}`,
    ),
}
