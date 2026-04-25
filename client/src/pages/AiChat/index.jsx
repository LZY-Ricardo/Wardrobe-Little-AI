import SvgIcon from '@/components/SvgIcon'
import styles from './index.module.less'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, Popup, Toast } from 'antd-mobile'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import axios from '@/api'
import { useAuthStore } from '@/store'
import { blobToBase64, compressImage } from '@/utils/imageUtils'
import AgentHistoryPanel from '@/components/AgentHistoryPanel'

const STREAM_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const CHAT_IMAGE_MAX_SIZE = 1 * 1024 * 1024
const CHAT_IMAGE_COMPRESS = { quality: 0.82, maxWidth: 960, maxHeight: 960 }

const QUICK_PROMPTS = ['今日穿什么', '场景推荐', '项目使用帮助']

const looksCorrupted = (text = '') => /[�]|[ÃÅæçéêëîïôöùûüÿÐÑØ×]/.test(String(text))

const normalizeSessionText = (text = '', fallback = 'chat') => {
  const value = String(text || '').trim()
  if (!value) return fallback
  return looksCorrupted(value) ? fallback : value
}

const formatDateBadge = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isToday) {
    return `今天 ${date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
  }

  return date.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  })
}

const mapMessage = (message) => ({
  id: message.id,
  role: message.role === 'user' ? 'user' : 'assistant',
  content: message.content || '',
  messageType: message.message_type || 'chat',
  confirmationStatus: message.confirmation_status || '',
  deliveryStatus: 'sent',
  attachments: Array.isArray(message.attachments) ? message.attachments : [],
  toolPhase: '',
})

const getDisplayMessageText = (message) => {
  if (!message) return ''
  const text = String(message.content || '')
  if (!['image', 'multimodal'].includes(message.messageType)) return text

  const cleaned = text
    .replace(/^\[图片消息\]\s*/m, '')
    .replace(/^图片理解：.*$/m, '')
    .replace(/^用户说明：/m, '')
    .trim()

  return cleaned
}

const createOptimisticUserMessage = ({ content = '', attachment = null }) => ({
  id: `temp-${Date.now()}`,
  role: 'user',
  content,
  messageType: attachment ? (content ? 'multimodal' : 'image') : 'chat',
  confirmationStatus: '',
  deliveryStatus: 'sending',
  attachments: attachment ? [attachment] : [],
})

export default function AiChat() {
  const navigate = useNavigate()
  const location = useLocation()
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const imagePickerRef = useRef(null)
  const abortControllerRef = useRef(null)

  const sessionId = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return Number.parseInt(search.get('sessionId') || '', 10)
  }, [location.search])

  const prefillText = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return search.get('prefill') || ''
  }, [location.search])

  const shouldOpenHistoryFromQuery = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return search.get('history') === '1'
  }, [location.search])

  const fallbackSession = location.state?.session || null
  const [session, setSession] = useState(fallbackSession)
  const [sessionList, setSessionList] = useState([])
  const [messages, setMessages] = useState([])
  const [localMessages, setLocalMessages] = useState([])
  const [pendingImage, setPendingImage] = useState(null)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('loading')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [latestTask, setLatestTask] = useState(null)
  const [pendingConfirmation, setPendingConfirmation] = useState(null)
  const [historyVisible, setHistoryVisible] = useState(false)
  const [actionsVisible, setActionsVisible] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const displayedMessages = useMemo(() => [...messages, ...localMessages], [messages, localMessages])

  const loadSession = useCallback(async () => {
    if (!Number.isFinite(sessionId)) {
      if (prefillText) {
        setStatus('success')
        return
      }
      setError('会话不存在')
      setStatus('error')
      return
    }

    setStatus('loading')
    setError('')
    try {
      const res = await axios.get(`/unified-agent/sessions/${sessionId}`)
      const payload = res?.data || {}
      setSession(payload.session || fallbackSession)
      setMessages(Array.isArray(payload.recent_messages) ? payload.recent_messages.map(mapMessage) : [])
      setLocalMessages([])
      setPendingConfirmation(null)
      setLatestTask(null)
      setStatus('success')
    } catch (loadError) {
      console.error('加载会话失败:', loadError)
      setError('加载会话失败，请稍后重试')
      setStatus('error')
    }
  }, [fallbackSession, sessionId, prefillText])

  const loadSessionList = useCallback(async () => {
    try {
      const res = await axios.get('/unified-agent/sessions')
      setSessionList(Array.isArray(res?.data) ? res.data : [])
    } catch (loadError) {
      console.error('加载会话列表失败:', loadError)
      Toast.show({ icon: 'fail', content: '加载历史会话失败', duration: 1200 })
    }
  }, [])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!prefillText || status !== 'success') return
    setInput(prefillText)
    inputRef.current?.focus()
  }, [prefillText, status])

  useEffect(() => {
    if (!historyVisible) return
    void loadSessionList()
  }, [historyVisible, loadSessionList])

  useEffect(() => {
    if (!shouldOpenHistoryFromQuery) return
    setHistoryVisible(true)
  }, [shouldOpenHistoryFromQuery])

  useEffect(() => {
    requestAnimationFrame(() => {
      if (!scrollRef.current) return
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }, [displayedMessages, status])

  useEffect(() => () => abortControllerRef.current?.abort(), [])

  const sendMessage = useCallback(async ({ content = '', image = null, preserveInput = false } = {}) => {
    const trimmedContent = String(content || '').trim()
    if ((!trimmedContent && !image) || sending) return

    let activeSessionId = sessionId

    if (!Number.isFinite(activeSessionId)) {
      try {
        const createRes = await axios.post('/unified-agent/sessions', { firstMessage: trimmedContent || '图片消息' })
        const createPayload = createRes?.data || {}
        if (createPayload?.session?.id) {
          activeSessionId = createPayload.session.id
          setSession(createPayload.session)
          navigate(`/aichat?sessionId=${activeSessionId}`, { replace: true, state: { session: createPayload.session } })
        } else {
          Toast.show({ icon: 'fail', content: '创建会话失败' })
          return
        }
      } catch (err) {
        console.error('创建会话失败:', err)
        Toast.show({ icon: 'fail', content: '创建会话失败' })
        return
      }
    }

    const optimisticMessage = createOptimisticUserMessage({ content: trimmedContent, attachment: image })

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    const streamMessageId = `stream-${Date.now()}`
    const streamPlaceholder = {
      id: streamMessageId,
      role: 'assistant',
      content: '',
      messageType: 'chat',
      confirmationStatus: '',
      deliveryStatus: 'streaming',
      toolPhase: image ? '正在准备图片消息…' : '',
    }

    setLocalMessages((prev) => [...prev, optimisticMessage, streamPlaceholder])
    setInput('')
    setSending(true)
    setPendingConfirmation(null)

    let fullText = ''

    try {
      const token = useAuthStore.getState().accessToken || localStorage.getItem('access_token') || ''
      const response = await fetch(
        `${STREAM_BASE_URL}/unified-agent/sessions/${activeSessionId}/chat-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ input: trimmedContent, latestTask, attachments: image ? [image] : [] }),
          signal: controller.signal,
        }
      )

      if (!response.ok) {
        if (response.status === 401) {
          const refreshTokenValue = useAuthStore.getState().refreshToken || localStorage.getItem('refresh_token') || ''
          if (refreshTokenValue) {
            try {
              const refreshRes = await fetch(`${STREAM_BASE_URL}/user/refresh_token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshTokenValue }),
              })
              if (refreshRes.ok) {
                const refreshData = await refreshRes.json()
                if (refreshData.code === 1 && refreshData.access_token) {
                  useAuthStore.getState().setTokens({
                    accessToken: refreshData.access_token,
                    refreshToken: refreshData.refresh_token,
                  })
                  setLocalMessages((prev) => prev.filter((m) => m.id !== streamMessageId && m.id !== optimisticMessage.id))
                  setSending(false)
                  if (preserveInput) setInput(trimmedContent)
                  return
                }
              }
            } catch { /* refresh failed */ }
          }
          useAuthStore.getState().clearTokens()
          window.location.href = '/login'
          return
        }
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() || ''

        for (const frame of frames) {
          const lines = frame.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data: ')) continue
            const payload = trimmed.slice(6)
            if (payload === '[DONE]') continue

            let event
            try { event = JSON.parse(payload) } catch { continue }

            if (event.type === 'content') {
              fullText += event.text
              setLocalMessages((prev) =>
                prev.map((m) => (m.id === streamMessageId ? { ...m, content: fullText, toolPhase: '' } : m))
              )
            } else if (event.type === 'tool_call_started') {
              setLocalMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMessageId
                    ? { ...m, toolPhase: event.message || '正在分析图片…' }
                    : m
                )
              )
            } else if (event.type === 'tool_call_completed') {
              setLocalMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMessageId
                    ? { ...m, toolPhase: event.message || (event.ok ? '图片分析完成' : '图片分析失败') }
                    : m
                )
              )
            } else if (event.type === 'task_result') {
              const restored = event.restored || {}
              setSession(restored.session || fallbackSession)
              setMessages(Array.isArray(restored.recent_messages) ? restored.recent_messages.map(mapMessage) : [])
              setLocalMessages([])
              setPendingImage(null)
              setLatestTask(event.latest_task || null)
              if (event.latest_task?.requiresConfirmation && event.latest_task.confirmation) {
                setPendingConfirmation(event.latest_task.confirmation)
              }
            } else if (event.type === 'message_saved') {
              const restored = event.restored || {}
              setSession(restored.session || fallbackSession)
              setMessages(Array.isArray(restored.recent_messages) ? restored.recent_messages.map(mapMessage) : [])
              setLocalMessages([])
              setPendingImage(null)
              setLatestTask(null)
            } else if (event.type === 'meta') {
              if (event.title && event.title !== '新会话') {
                setSession((prev) => (prev ? { ...prev, title: event.title } : prev))
              }
            } else if (event.type === 'error') {
              Toast.show({ icon: 'fail', content: event.msg || '发送失败', duration: 2000 })
              setLocalMessages((prev) =>
                prev.map((m) =>
                  m.id === streamMessageId
                    ? { ...m, deliveryStatus: 'failed', content: fullText || event.msg || '发送失败' }
                    : m
                )
              )
              setLocalMessages((prev) =>
                prev.map((m) =>
                  m.id === optimisticMessage.id ? { ...m, deliveryStatus: 'failed' } : m
                )
              )
              if (preserveInput) setInput(trimmedContent)
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setLocalMessages((prev) => prev.filter((m) => m.id !== streamMessageId))
        return
      }
      console.error('发送消息失败:', err)
      setLocalMessages((prev) =>
        prev.map((m) =>
          m.id === streamMessageId
            ? { ...m, deliveryStatus: 'failed', content: fullText || '发送失败，请重试' }
            : m
        )
      )
      setLocalMessages((prev) =>
        prev.map((m) => (m.id === optimisticMessage.id ? { ...m, deliveryStatus: 'failed' } : m))
      )
      if (preserveInput) setInput(trimmedContent)
    } finally {
      setSending(false)
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }, [fallbackSession, latestTask, navigate, sending, sessionId])

  const handleSend = async (presetValue) => {
    await sendMessage({ content: String(presetValue ?? input).trim(), image: pendingImage, preserveInput: true })
  }

  const handleRetryMessage = async (message) => {
    if (!message || sending) return
    await sendMessage({
      content: message.content,
      image: Array.isArray(message.attachments) ? message.attachments[0] || null : null,
      preserveInput: false,
    })
    setLocalMessages((prev) => prev.filter((item) => item.id !== message.id))
  }

  const handleConfirm = async () => {
    if (!pendingConfirmation?.confirmId || !Number.isFinite(sessionId) || sending) return
    setSending(true)
    try {
      const res = await axios.post(`/unified-agent/sessions/${sessionId}/confirm`, {
        confirmId: pendingConfirmation.confirmId,
      })
      const payload = res?.data || {}
      const restored = payload?.restored || {}
      setSession(restored.session || fallbackSession)
      setMessages(Array.isArray(restored.recent_messages) ? restored.recent_messages.map(mapMessage) : [])
      setLatestTask(payload?.latest_task || null)
      setPendingConfirmation(null)
    } catch (actionError) {
      console.error('确认操作失败:', actionError)
    } finally {
      setSending(false)
    }
  }

  const handleCancel = async () => {
    if (!pendingConfirmation?.confirmId || !Number.isFinite(sessionId) || sending) return
    setSending(true)
    try {
      const res = await axios.post(`/unified-agent/sessions/${sessionId}/cancel`, {
        confirmId: pendingConfirmation.confirmId,
      })
      const payload = res?.data || {}
      const restored = payload?.restored || {}
      setSession(restored.session || fallbackSession)
      setMessages(Array.isArray(restored.recent_messages) ? restored.recent_messages.map(mapMessage) : [])
      setLatestTask(payload?.latest_task || null)
      setPendingConfirmation(null)
    } catch (actionError) {
      console.error('取消操作失败:', actionError)
    } finally {
      setSending(false)
    }
  }

  const handleOpenHistory = () => {
    setActionsVisible(false)
    void loadSessionList()
    setHistoryVisible(true)
  }

  const handleExpandHistoryPage = useCallback(() => {
    setHistoryVisible(false)
    if (Number.isFinite(sessionId)) {
      navigate(`/agent/history?sessionId=${sessionId}`, {
        state: { session },
      })
      return
    }
    navigate('/agent/history')
  }, [navigate, session, sessionId])

  const handleOpenActions = () => {
    setHistoryVisible(false)
    setActionsVisible(true)
  }

  const handleCreateNewSession = async () => {
    setActionsVisible(false)
    try {
      const res = await axios.post('/unified-agent/sessions', { firstMessage: '新会话' })
      const payload = res?.data || {}
      if (payload?.session?.id) {
        navigate(`/aichat?sessionId=${payload.session.id}`, {
          replace: true,
          state: { session: payload.session },
        })
        return
      }
      Toast.show({ icon: 'fail', content: '创建会话失败', duration: 1200 })
    } catch (createError) {
      console.error('新建会话失败:', createError)
      Toast.show({ icon: 'fail', content: '创建会话失败', duration: 1200 })
    }
  }

  const handleFillPrompt = (text) => {
    setActionsVisible(false)
    setInput(text)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleOpenAlbum = () => {
    setActionsVisible(false)
    imagePickerRef.current?.click()
  }

  const handlePickImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      Toast.show({ icon: 'fail', content: '请选择图片文件', duration: 1200 })
      return
    }

    try {
      const compressedBlob = await compressImage(
        file,
        CHAT_IMAGE_COMPRESS.quality,
        CHAT_IMAGE_COMPRESS.maxWidth,
        CHAT_IMAGE_COMPRESS.maxHeight,
      )
      if (compressedBlob.size > CHAT_IMAGE_MAX_SIZE) {
        Toast.show({ icon: 'fail', content: '图片过大，请换一张更小的图片', duration: 1200 })
        return
      }

      const dataUrl = await blobToBase64(compressedBlob)
      setPendingImage({
        type: 'image',
        mimeType: compressedBlob.type || file.type || 'image/jpeg',
        name: file.name || 'selected-image',
        dataUrl,
      })
      requestAnimationFrame(() => inputRef.current?.focus())
    } catch (pickError) {
      console.error('读取相册图片失败:', pickError)
      Toast.show({ icon: 'fail', content: '图片读取失败', duration: 1200 })
    }
  }

  const handleRemovePendingImage = () => {
    setPendingImage(null)
  }

  const handleSelectHistorySession = (targetSession) => {
    setHistoryVisible(false)
    if (!targetSession?.id || targetSession.id === sessionId) return
    navigate(`/aichat?sessionId=${targetSession.id}`, {
      replace: true,
      state: { session: targetSession },
    })
  }

  const handleRenameSession = async () => {
    if (!Number.isFinite(sessionId) || renaming) return

    const nextTitle = window.prompt('请输入新的会话标题', normalizeSessionText(session?.title, '新对话'))
    if (nextTitle === null) return

    const title = String(nextTitle).trim()
    if (!title) {
      Toast.show({ icon: 'fail', content: '会话标题不能为空', duration: 1200 })
      return
    }

    setRenaming(true)
    try {
      const res = await axios.patch(`/unified-agent/sessions/${sessionId}`, { title })
      setSession(res?.data || session)
      setActionsVisible(false)
      Toast.show({ icon: 'success', content: '重命名成功', duration: 1000 })
      await loadSessionList()
    } catch (renameError) {
      console.error('重命名会话失败:', renameError)
      Toast.show({ icon: 'fail', content: '重命名失败，请重试', duration: 1200 })
    } finally {
      setRenaming(false)
    }
  }

  const handleDeleteSession = async () => {
    if (!Number.isFinite(sessionId)) return

    const confirmed = await Dialog.confirm({
      content: '删除后将无法恢复，会话中的消息与上下文会一起移除。',
      confirmText: '确认删除',
      cancelText: '取消',
    }).catch(() => false)

    if (!confirmed) return

    try {
      await axios.delete(`/unified-agent/sessions/${sessionId}`)
      Toast.show({ icon: 'success', content: '删除成功', duration: 1000 })
      navigate('/unified-agent', { replace: true })
    } catch (deleteError) {
      console.error('删除会话失败:', deleteError)
      Toast.show({ icon: 'fail', content: '删除失败，请重试', duration: 1200 })
    } finally {
      setActionsVisible(false)
    }
  }

  const showEmptyState = status === 'success' && displayedMessages.length === 0
  const sessionTitle = normalizeSessionText(session?.title, '新对话')

  return (
    <div className={styles.chat}>
      <div className={styles.heroBg} />

      <header className={styles.chatHeader}>
        <button type="button" className={styles.iconButton} onClick={() => navigate('/unified-agent')}>
          ‹
        </button>
        <div className={styles.headerMain}>
          <div className={styles.headerAvatar}>
            <svg viewBox="0 0 60 60" fill="none" width="100%" height="100%">
              <rect width="60" height="60" rx="30" fill="#1a1a2e" />
              <polygon points="30,12 44,36 16,36" fill="none" stroke="#a855f7" strokeWidth="2.5" opacity="0.9" />
              <polygon points="30,48 16,24 44,24" fill="none" stroke="#7c3aed" strokeWidth="2.5" opacity="0.9" />
              <circle cx="30" cy="30" r="8" fill="none" stroke="#c084fc" strokeWidth="2" opacity="0.8" />
              <circle cx="30" cy="30" r="3" fill="#a855f7" />
              <circle cx="22" cy="18" r="1.5" fill="#c084fc" opacity="0.6" />
              <circle cx="38" cy="42" r="1.5" fill="#7c3aed" opacity="0.6" />
            </svg>
          </div>
          <div>
            <div className={styles.headerTitle}>{sessionTitle}</div>
          </div>
        </div>
        <button type="button" className={styles.iconButton} onClick={handleOpenHistory} aria-label="??????">
          <span className={styles.historyIcon} aria-hidden="true" />
        </button>
      </header>

      <div className={styles.chatBody} ref={scrollRef}>
        {status === 'loading' ? <div className={styles.stateText}>加载会话中...</div> : null}
        {status === 'error' ? <div className={styles.stateText}>{error}</div> : null}

        {status === 'success' ? (
          <>
            {displayedMessages[0]?.id ? <div className={styles.dateBadge}>{formatDateBadge(session?.last_message_at)}</div> : null}

            {showEmptyState ? (
              <div className={styles.emptyBlock}>
                <div className={styles.emptyTitle}>今天想一起完成什么？</div>
                <div className={styles.quickPromptList}>
                  {QUICK_PROMPTS.map((item) => (
                    <button key={item} type="button" className={styles.quickPrompt} onClick={() => handleSend(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {displayedMessages.map((message) => (
              <div
                key={message.id}
                className={`${styles.messageRow} ${message.role === 'user' ? styles.fromUser : styles.fromAssistant}`}
              >
                <div className={message.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                  {message.role === 'assistant' ? (
                    <div className={styles.messageLabel}>
                      <svg viewBox="0 0 60 60" fill="none" className={styles.labelAvatar}>
                        <rect width="60" height="60" rx="30" fill="#1a1a2e" />
                        <polygon points="30,12 44,36 16,36" fill="none" stroke="#a855f7" strokeWidth="2.5" opacity="0.9" />
                        <polygon points="30,48 16,24 44,24" fill="none" stroke="#7c3aed" strokeWidth="2.5" opacity="0.9" />
                        <circle cx="30" cy="30" r="8" fill="none" stroke="#c084fc" strokeWidth="2" opacity="0.8" />
                        <circle cx="30" cy="30" r="3" fill="#a855f7" />
                      </svg>
                      Agent
                    </div>
                  ) : null}
                  {Array.isArray(message.attachments) && message.attachments[0]?.dataUrl ? (
                    <div className={styles.messageImageWrap}>
                      <img src={message.attachments[0].dataUrl} alt={message.attachments[0].name || '图片消息'} className={styles.messageImage} />
                    </div>
                  ) : null}
                  <div className={`${styles.messageText} ${styles.markdownContent} ${message.deliveryStatus === 'streaming' && message.content ? styles.streamingCursor : ''}`}>
                    {message.deliveryStatus === 'streaming' && !message.content ? (
                      <div className={styles.streamingState}>
                        {message.toolPhase ? <div className={styles.toolPhaseText}>{message.toolPhase}</div> : null}
                        <div className={styles.typingIndicator}>
                          <span /><span /><span />
                        </div>
                      </div>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{getDisplayMessageText(message)}</ReactMarkdown>
                    )}
                  </div>
                  {message.role === 'user' && message.deliveryStatus === 'failed' ? (
                    <div className={styles.messageStatusRow}>
                      <div className={styles.messageStatus}>未发送</div>
                      <button type="button" className={styles.retryButton} onClick={() => handleRetryMessage(message)}>
                        重发
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {pendingConfirmation ? (
              <div className={styles.confirmCard}>
                <div className={styles.confirmTitle}>待确认操作</div>
                <div className={styles.confirmText}>影响范围：{pendingConfirmation.scope}</div>
                <div className={styles.confirmText}>风险提示：{pendingConfirmation.risk}</div>
                <div className={styles.confirmActions}>
                  <button type="button" className={styles.secondaryAction} onClick={handleCancel} disabled={sending}>
                    取消
                  </button>
                  <button type="button" className={styles.primaryAction} onClick={handleConfirm} disabled={sending}>
                    确认执行
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <footer className={styles.chatFooter}>
        {pendingImage ? (
          <div className={styles.pendingImageCard}>
            <img src={pendingImage.dataUrl} alt={pendingImage.name || '待发送图片'} className={styles.pendingImagePreview} />
            <div className={styles.pendingImageMeta}>
              <div className={styles.pendingImageTitle}>待发送图片</div>
              <div className={styles.pendingImageName}>{pendingImage.name || 'image'}</div>
            </div>
            <button type="button" className={styles.pendingImageRemove} onClick={handleRemovePendingImage}>
              ×
            </button>
          </div>
        ) : null}
        <div className={styles.composer}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={styles.input}
            placeholder="尽管问，让你成为穿搭达人..."
            disabled={sending || status !== 'success'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSend()
              }
            }}
          />
          <button
            type="button"
            className={styles.plusButton}
            disabled={sending || status !== 'success'}
            onClick={handleOpenActions}
            aria-label="更多操作"
          >
            +
          </button>
          <button type="button" className={styles.sendButton} onClick={() => handleSend()} disabled={sending || status !== 'success'}>
            {sending ? '…' : '>'}
          </button>
        </div>
        <input ref={imagePickerRef} type="file" accept="image/*" hidden onChange={handlePickImage} />
      </footer>

      <Popup
        visible={historyVisible}
        onMaskClick={() => setHistoryVisible(false)}
        position="bottom"
        bodyClassName={styles.sheetPopup}
      >
        <AgentHistoryPanel
          sessionId={sessionId}
          session={session}
          sessionList={sessionList}
          loadSessionList={loadSessionList}
          requestDeleteSession={async (targetSessionId, shouldLeaveChat) => {
            try {
              await axios.delete(`/unified-agent/sessions/${targetSessionId}`)
              Toast.show({ icon: 'success', content: '已删除', duration: 1000 })

              if (!shouldLeaveChat) {
                setSessionList((prev) => prev.filter((item) => item.id !== targetSessionId))
              }

              return true
            } catch (deleteError) {
              console.error('删除历史会话失败:', deleteError)
              Toast.show({ icon: 'fail', content: '删除失败', duration: 1200 })
              return false
            }
          }}
          onSelectSession={handleSelectHistorySession}
          onClose={() => setHistoryVisible(false)}
          onExpandFull={handleExpandHistoryPage}
          embedded
        />
      </Popup>

      <Popup
        visible={actionsVisible}
        onMaskClick={() => setActionsVisible(false)}
        position="bottom"
        bodyClassName={styles.sheetPopup}
      >
        <div className={styles.sheet}>
          <div className={styles.sheetHandle} />
          <div className={styles.sheetTitleSmall}>更多操作</div>
          <button type="button" className={styles.actionItem} onClick={handleOpenAlbum}>
            打开相册
          </button>
          <button type="button" className={styles.actionItem} onClick={handleCreateNewSession}>
            新建会话
          </button>
          <button type="button" className={styles.actionItem} onClick={handleOpenHistory}>
            查看历史会话
          </button>
          <button type="button" className={styles.actionItem} onClick={() => handleFillPrompt('帮我推荐今天穿什么')}>
            场景推荐
          </button>
          <button type="button" className={styles.actionItem} onClick={() => handleFillPrompt('教我怎么使用这个页面')}>
            使用帮助
          </button>
          <button type="button" className={styles.actionItem} onClick={handleRenameSession} disabled={renaming}>
            {renaming ? '保存中...' : '重命名会话'}
          </button>
          <button type="button" className={`${styles.actionItem} ${styles.actionDanger}`} onClick={handleDeleteSession}>
            删除会话
          </button>
          <button type="button" className={styles.actionPrimary} onClick={() => setActionsVisible(false)}>
            取消
          </button>
        </div>
      </Popup>
    </div>
  )
}
