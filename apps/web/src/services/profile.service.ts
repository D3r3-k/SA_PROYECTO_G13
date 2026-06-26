import api from './api'

export interface Profile {
  profile_id: string
  user_id: string
  name: string
  avatar_url: string
  is_child: boolean
  parental_pin_configured: boolean
}

export const profileService = {
  list: () =>
    api.get<{ profiles: Profile[] }>('/profiles'),

  create: (payload: { name: string; avatar_url?: string; is_child?: boolean; parental_pin?: string }) =>
    api.post<Profile>('/profiles', payload),

  select: (profileId: string) =>
    api.post(`/profiles/${profileId}/select`),

  update: (profileId: string, payload: { name: string; avatar_url?: string; is_child?: boolean; parental_pin?: string }) =>
    api.put(`/profiles/${profileId}`, payload),

  remove: (profileId: string) =>
    api.delete(`/profiles/${profileId}`),
}
