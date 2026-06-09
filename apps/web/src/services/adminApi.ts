import axios from 'axios'

const adminApi = axios.create({
  baseURL: '/api/admin',
})

adminApi.interceptors.request.use((config) => {
  config.headers['x-admin-key'] = sessionStorage.getItem('adminKey') ?? ''
  return config
})

export default adminApi
