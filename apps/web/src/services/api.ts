import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const requestUrl: string = err.config?.url ?? ''
      const onLoginPage = window.location.pathname === '/login'
      // /auth/me es el chequeo de sesión — useAuth lo maneja con su propio catch,
      // redirigir aquí causaría un bucle infinito de recargas.
      const isSessionCheck = requestUrl.includes('/auth/me')
      if (!onLoginPage && !isSessionCheck) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
