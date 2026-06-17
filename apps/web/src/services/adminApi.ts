import axios from 'axios'

const adminApi = axios.create({
  baseURL: '/api/admin',
  withCredentials: true,
})

adminApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const onAdminLogin = window.location.pathname === '/login/admin'
      if (!onAdminLogin) {
        window.location.href = '/login/admin'
      }
    }
    return Promise.reject(err)
  },
)

export default adminApi
