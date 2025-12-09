import axios from 'axios'
import { Toast } from 'antd-mobile'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const DEFAULT_TIMEOUT = 15000

const ERROR_CODE_MESSAGE = {
  0: '登录已过期，请重新登录',
  2: '请先登录',
  3: '登录失效，请重新登录',
}

const getAccessToken = () => localStorage.getItem('access_token') || ''
const getRefreshToken = () => localStorage.getItem('refresh_token') || ''

const logoutAndRedirect = (message = '登录失效，请重新登录') => {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  Toast.show({ icon: 'fail', content: message, duration: 1000 })
  setTimeout(() => {
    window.location.href = '/login'
  }, 800)
}

const refreshClient = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
})

const api = axios.create({
  baseURL: BASE_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
})

let isRefreshing = false
let refreshQueue = []

const subscribeRefresh = (resolve, reject) => {
  refreshQueue.push({ resolve, reject })
}

const flushQueue = (error, token) => {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token)
    }
  })
  refreshQueue = []
}

const refreshToken = async () => {
  const refreshTokenValue = getRefreshToken()
  if (!refreshTokenValue) {
    throw new Error('NO_REFRESH_TOKEN')
  }
  const res = await refreshClient.post('/user/refresh_token', {
    refresh_token: refreshTokenValue,
  })
  if (res?.data?.code === 1) {
    const { access_token, refresh_token } = res.data
    if (access_token) localStorage.setItem('access_token', access_token)
    if (refresh_token) localStorage.setItem('refresh_token', refresh_token)
    return access_token
  }
  const msg = res?.data?.msg || '刷新 token 失败'
  throw new Error(msg)
}

api.interceptors.request.use(
  (config) => {
    const token = getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => {
    // 仅处理业务成功，其他交给 error 拦截
    if (response.status === 200) {
      const data = response.data
      if (data?.code === 1) return data
      const message = data?.msg || '请求失败'
      Toast.show({ icon: 'fail', content: message, duration: 1200 })
      return Promise.reject(data)
    }
    return Promise.reject(response)
  },
  async (error) => {
    const { response, config } = error || {}
    const originalRequest = config || {}

    if (response?.status === 401) {
      const errCode = response?.data?.code
      // access token 过期，尝试刷新
      if (errCode === 0 && !originalRequest._retry) {
        originalRequest._retry = true

        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            subscribeRefresh(
              (token) => {
                originalRequest.headers.Authorization = `Bearer ${token}`
                resolve(api(originalRequest))
              },
              reject
            )
          })
        }

        isRefreshing = true
        try {
          const newToken = await refreshToken()
          flushQueue(null, newToken)
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return api(originalRequest)
        } catch (refreshError) {
          flushQueue(refreshError, null)
          logoutAndRedirect(ERROR_CODE_MESSAGE[errCode] || '登录失效，请重新登录')
          return Promise.reject(refreshError)
        } finally {
          isRefreshing = false
        }
      }

      // 无刷新或长 token 也失效
      logoutAndRedirect(ERROR_CODE_MESSAGE[errCode] || '登录失效，请重新登录')
      return Promise.reject(error)
    }

    const statusMessage = response?.data?.msg || ERROR_CODE_MESSAGE[response?.data?.code]
    if (statusMessage) {
      Toast.show({ icon: 'fail', content: statusMessage, duration: 1200 })
    } else {
      Toast.show({ icon: 'fail', content: '网络异常，请稍后重试', duration: 1200 })
    }

    return Promise.reject(error)
  }
)

export default api

