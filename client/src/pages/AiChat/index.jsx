import SvgIcon from '@/components/SvgIcon'
import DarkModeToggle from '@/components/DarkModeToggle'
import styles from './index.module.less'
import { useRef, useState, useEffect } from 'react'
import { Toast } from 'antd-mobile'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store'

const STREAM_TIMEOUT = 120000
const MAX_RETRY = 3
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

const QUICK_PROMPTS = [
  {
    label: '功能总览',
    value: '请介绍一下这个智能穿搭项目有哪些功能，并告诉我每个页面怎么使用。',
  },
  {
    label: '上传衣物',
    value: '我想添加一件衣物（上传/分析/保存），应该怎么操作？',
  },
  {
    label: '场景推荐',
    value: '如何在推荐页生成场景推荐？比如“商务/通勤/约会/运动”。',
  },
  {
    label: '搭配预览',
    value: '如何在搭配中心生成预览图？如果提示缺少人物模特应该怎么做？',
  },
  {
    label: '穿搭建议',
    value: '我想要一些穿搭建议：请先问我必要的问题，再给出 2-3 套可执行的方案。',
  },
]

export default function AiChat() {
  const inputRef = useRef(null)
  const controllerRef = useRef(null)
  const messagesRef = useRef([])
  const retryRef = useRef(0)

  const [list, setList] = useState([])
  const [disabled, setDisabled] = useState(false)
  const [connectionState, setConnectionState] = useState('idle') // idle|connecting|streaming|error
  const [errorMessage, setErrorMessage] = useState('')
  const navigate = useNavigate()

  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) return false

    try {
      const res = await fetch(`${API_BASE_URL}/user/refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (!res.ok) return false
      const data = await res.json()
      if (data?.code === 1 && data?.access_token) {
        localStorage.setItem('access_token', data.access_token)
        if (data.refresh_token) {
          localStorage.setItem('refresh_token', data.refresh_token)
        }
        useAuthStore.getState().setTokens({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        })
        return true
      }
    } catch (error) {
      console.error('刷新 token 失败:', error)
    }

    return false
  }

  useEffect(() => {
    messagesRef.current = list
  }, [list])

  const stopStreaming = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setConnectionState('idle')
    setDisabled(false)
  }

  const scheduleRetry = (payload) => {
    if (retryRef.current >= MAX_RETRY) {
      setConnectionState('error')
      setErrorMessage('多次重试失败，请稍后再试')
      setDisabled(false)
      return
    }
    retryRef.current += 1
    const delay = Math.min(5000, 500 * 2 ** retryRef.current)
    setTimeout(() => send(payload, true), delay)
  }

  const send = async (payload, isRetry = false) => {
    const input = payload || inputRef.current?.value?.trim()
    if (!input) {
      Toast.show({ content: '请输入内容', duration: 1000 })
      return
    }

    if (connectionState === 'connecting' || connectionState === 'streaming') {
      Toast.show({ content: '正在生成，请稍候或点击停止', duration: 1200 })
      return
    }

    setDisabled(true)
    setConnectionState('connecting')
    setErrorMessage('')
    retryRef.current = isRetry ? retryRef.current : 0

    if (!isRetry) {
      setList((prev) => [...prev, { role: 'user', content: input }])
    }

    const historyBase = [...messagesRef.current]
    if (isRetry && historyBase.length && historyBase[historyBase.length - 1].role !== 'user') {
      historyBase.pop()
    }
    const history = isRetry ? historyBase : [...historyBase, { role: 'user', content: input }]
    const buildHeaders = () => {
      const token = localStorage.getItem('access_token') || ''
      return {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      }
    }
    const controller = new AbortController()
    controllerRef.current = controller

    try {
      let response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      })

      if (response.status === 401) {
        const refreshed = await refreshAccessToken()
        if (!refreshed) {
          useAuthStore.getState().clearTokens()
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('userInfo')
          Toast.show({ content: '登录已过期，请重新登录', duration: 1200 })
          navigate('/login', { replace: true })
          throw new Error('UNAUTHORIZED')
        }
        response = await fetch(`${API_BASE_URL}/chat`, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        })
      }

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`)
      }

      setConnectionState('streaming')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let botResponse = ''

      setList((prev) => {
        if (!isRetry) return [...prev, { role: 'assistant', content: '' }]
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role !== 'user') {
          next[next.length - 1] = { ...last, role: 'assistant', content: '' }
          return next
        }
        return [...next, { role: 'assistant', content: '' }]
      })

      let shouldBreak = false
      const timeoutId = setTimeout(() => {
        shouldBreak = true
        controller.abort()
      }, STREAM_TIMEOUT)

      while (true) {
        if (shouldBreak) break
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            shouldBreak = true
            break
          }
          if (data) {
            let decodedData
            try {
              decodedData = JSON.parse(data)
            } catch {
              decodedData = data
            }
            botResponse += decodedData
            const filteredResponse = botResponse
              .replace(/<think>[\s\S]*?<\/think>/gi, '')
              .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
              .replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/gi, '')
              .trim()

            setList((prev) => {
              const newList = [...prev]
              newList[newList.length - 1] = { role: 'assistant', content: filteredResponse }
              return newList
            })
          }
        }
      }

      clearTimeout(timeoutId)
      setConnectionState('idle')
      setDisabled(false)
      controllerRef.current = null
    } catch (error) {
      console.error('Chat error:', error)
      controllerRef.current = null
      setConnectionState('error')
      setErrorMessage(error.name === 'AbortError' ? '请求已取消' : '网络异常，准备重试')
      if (error.name !== 'AbortError') {
        scheduleRetry(input)
      } else {
        setDisabled(false)
      }
    }
  }

  return (
    <div className={styles['chat']}>
      <div className={styles['chat-header']}>
        <div className={styles['header-back']} onClick={() => navigate(-1)}>
          <SvgIcon iconName="icon-fanhui" />
        </div>
        <div className={styles['header-title']}>AI衣物小助手</div>
        <div className={styles['header-actions']}>
          <DarkModeToggle />
        </div>
      </div>
      <div className={styles['chat-container']}>
        <div className={styles['bot']}>
          你好，我是AI衣物小助手，有什么我可以帮忙的吗？
        </div>
        <div className={styles['quick-prompts']}>
          {QUICK_PROMPTS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => send(item.value)}
              disabled={connectionState === 'connecting' || connectionState === 'streaming'}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles['hint']}>提示：输入 /help 可查看示例问题</div>

        <div className={styles['container-chat']}>
          {list.map((item, index) => {
            if (item.role === 'user') {
              return (
                <div className={styles['user']} key={index}>
                  {item.content}
                </div>
              )
            }
            return (
              <div className={styles['bot']} key={index}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {item.content}
                </ReactMarkdown>
              </div>
            )
          })}

          {errorMessage ? <div className={styles['error-text']}>{errorMessage}</div> : null}
        </div>
      </div>
      <div className={styles['chat-footer']}>
        <div className={styles['footer-input']}>
          <input type="text" placeholder="请输入问题（/help）" ref={inputRef} />
          <button onClick={() => send()} disabled={disabled}>
            发送
          </button>
          <button onClick={stopStreaming} disabled={connectionState === 'idle'} className={styles['stop-btn']}>
            停止生成
          </button>
        </div>
      </div>
    </div>
  )
}
