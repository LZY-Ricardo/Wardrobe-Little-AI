import SvgIcon from '@/components/SvgIcon'
import DarkModeToggle from '@/components/DarkModeToggle'
import styles from './index.module.less'
import { useRef, useState, useEffect } from 'react'
import { Toast } from 'antd-mobile'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'

const STREAM_TIMEOUT = 120000
const MAX_RETRY = 3

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

    const history = [...messagesRef.current, { role: 'user', content: input }]
    const token = localStorage.getItem('access_token')
    const controller = new AbortController()
    controllerRef.current = controller

    try {
      const response = await fetch(`http://localhost:3000/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`)
      }

      setConnectionState('streaming')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let botResponse = ''

      setList((prev) => [...prev, { role: 'bot', content: '' }])

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
            } catch (e) {
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
              newList[newList.length - 1] = { role: 'bot', content: filteredResponse }
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
          <input type="text" placeholder="请输入问题" ref={inputRef} />
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