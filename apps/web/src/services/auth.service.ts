import api from './api'

export interface RegisterPayload {
  email: string
  password: string
  full_name: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface MeResponse {
  success: boolean
  user: { user_id: string; email: string; profile_id: string }
}

export const authService = {
  register: (payload: RegisterPayload) =>
    api.post('/auth/register', payload),

  login: (payload: LoginPayload) =>
    api.post('/auth/login', payload),

  logout: () =>
    api.post('/auth/logout'),

  me: () =>
    api.get<MeResponse>('/auth/me'),

  updateCredentials: (payload: { current_password: string; new_password: string }) =>
    api.put('/auth/credentials', payload),
}
