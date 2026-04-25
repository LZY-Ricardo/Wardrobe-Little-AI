import { useCallback, useEffect, useRef } from 'react'
import { Toast } from 'antd-mobile'
import { useAuthStore } from '@/store'
import {
  migrateExpandedMessageId,
} from './reasoningState'
import {
  normalizeRestoredMessages,
} from './viewModels'
import {
  applyStreamAbort,
  applyStreamContent,
  applyStreamFailure,
  applyToolCompletedEvent,
  applyToolStartedEvent,
  createStreamPlaceholder,
  finalizeOptimisticUserMessage,
} from './streamState'

const STREAM_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const REASONING_THROTTLE_MS = 100
const WEATHER_GEO_CACHE_KEY = 'weather_geo_cache_v1'
const PROFILE_STORAGE_KEY = 'outfit-profile-v1'

const readSessionJson = (key) => {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const readLocalJson = (key) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const buildClientContext = () => {
  const geoCache = readSessionJson(WEATHER_GEO_CACHE_KEY)
  const profile = readLocalJson(PROFILE_STORAGE_KEY)

  const latitude = Number(geoCache?.coords?.latitude)
  const longitude = Number(geoCache?.coords?.longitude)
  const profileCity = String(profile?.city || '').trim()

  const next = {}
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    next.geo = { latitude, longitude }
  }
  if (profileCity) {
    next.profile = { city: profileCity }
  }
  return Object.keys(next).length ? next : null
}

const createOptimisticUserMessage = ({ content = '', attachments = [] }) => ({
  id: `temp-${Date.now()}`,
  role: 'user',
  content,
  messageType: attachments.length ? (content ? 'multimodal' : 'image') : 'chat',
  confirmationStatus: '',
  deliveryStatus: 'sending',
  attachments,
})

export default function useAgentStreamSession({
  sessionId,
  latestTask,
  fallbackSession,
  sending,
  navigate,
  setSession,
  setMessages,
  setLocalMessages,
  setInput,
  setSending,
  setPendingConfirmation,
  setLatestTask,
  setPendingImages,
  setExpandedReasoning,
  setExpandedToolMessages,
}) {
  const abortControllerRef = useRef(null)

  useEffect(() => () => {
    abortControllerRef.current?.abort()
  }, [])

  const sendMessage = useCallback(async ({ content = '', images = [], preserveInput = false } = {}) => {
    const trimmedContent = String(content || '').trim()
    if ((!trimmedContent && !images.length) || sending) return

    let activeSessionId = sessionId

    if (!Number.isFinite(activeSessionId)) {
      try {
        const createRes = await fetch(`${STREAM_BASE_URL}/unified-agent/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${useAuthStore.getState().accessToken || localStorage.getItem('access_token') || ''}`,
          },
          body: JSON.stringify({ firstMessage: trimmedContent || '图片消息' }),
        })
        const createPayload = await createRes.json()
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

    const optimisticMessage = createOptimisticUserMessage({ content: trimmedContent, attachments: images })

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    const streamMessageId = `stream-${Date.now()}`
    const streamPlaceholder = createStreamPlaceholder({
      imageCount: images.length,
      streamMessageId,
    })

    setLocalMessages((prev) => [...prev, optimisticMessage, streamPlaceholder])
    setInput('')
    setSending(true)
    setPendingConfirmation(null)

    let fullText = ''
    let reasoningText = ''
    let reasoningStartTime = null
    let reasoningDurationMs = null
    let reasoningLastEventAt = null
    let userMessagePersisted = false
    const throttleState = {
      timer: null,
      buffer: '',
    }

    const updateStreamMessage = (updater) => {
      setLocalMessages((prev) =>
        prev.map((message) => (message.id === streamMessageId ? updater(message) : message))
      )
    }

    const flushReasoning = ({ endReasoning = false } = {}) => {
      if (throttleState.timer) {
        clearTimeout(throttleState.timer)
        throttleState.timer = null
      }

      let shouldApply = false
      if (throttleState.buffer) {
        reasoningText += throttleState.buffer
        throttleState.buffer = ''
        reasoningLastEventAt = Date.now()
        shouldApply = true
      }

      if (reasoningStartTime && (reasoningLastEventAt || endReasoning)) {
        reasoningDurationMs = Math.max((reasoningLastEventAt || Date.now()) - reasoningStartTime, 0)
        shouldApply = true
      }

      if (shouldApply) {
        updateStreamMessage((message) => ({
          ...message,
          reasoningContent: reasoningText,
          reasoningStartTime,
          reasoningDurationMs,
        }))
      }
    }

    const queueReasoningUpdate = (chunk) => {
      if (!chunk) return
      if (!reasoningStartTime) {
        reasoningStartTime = Date.now()
      }

      throttleState.buffer += chunk

      if (!throttleState.timer) {
        throttleState.timer = setTimeout(() => {
          flushReasoning()
        }, REASONING_THROTTLE_MS)
      }
    }

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
          body: JSON.stringify({
            input: trimmedContent,
            latestTask,
            attachments: images.length ? images : [],
            clientContext: buildClientContext(),
          }),
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
            } catch (refreshError) {
              console.warn('[AiChat] 刷新 token 失败:', refreshError)
            }
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
            const normalizedLine = line.trim()
            if (!normalizedLine.startsWith('data: ')) continue
            const payload = normalizedLine.slice(6)
            if (payload === '[DONE]') continue

            let event
            try {
              event = JSON.parse(payload)
            } catch {
              continue
            }

            if (event.type && event.type !== 'error') {
              userMessagePersisted = true
            }

            if (event.type === 'content') {
              flushReasoning({ endReasoning: true })
              fullText += event.text
              updateStreamMessage((message) => applyStreamContent(message, {
                fullText,
                reasoningText,
                reasoningStartTime,
                reasoningDurationMs,
              }))
            } else if (event.type === 'reasoning') {
              queueReasoningUpdate(event.text)
            } else if (event.type === 'tool_call_started') {
              console.log('[AiChat] Tool started:', event.tool, event.message)
              updateStreamMessage((message) => applyToolStartedEvent(message, event))
            } else if (event.type === 'tool_call_completed') {
              console.log('[AiChat] Tool completed:', event.tool, event.ok ? 'success' : 'failed', event.summary || '')
              updateStreamMessage((message) => applyToolCompletedEvent(message, event))
            } else if (event.type === 'task_result') {
              flushReasoning({ endReasoning: true })
              const restored = event.restored || {}
              setSession(restored.session || fallbackSession)
              setMessages(normalizeRestoredMessages(restored.recent_messages))
              setLocalMessages([])
              setPendingImages([])
              setLatestTask(event.latest_task || null)
              if (event.latest_task?.requiresConfirmation && event.latest_task.confirmation) {
                setPendingConfirmation(event.latest_task.confirmation)
              }
            } else if (event.type === 'message_saved') {
              flushReasoning({ endReasoning: true })
              const restored = event.restored || {}
              setExpandedReasoning((prev) => migrateExpandedMessageId(prev, streamMessageId, event.message?.id))
              setExpandedToolMessages((prev) => migrateExpandedMessageId(prev, streamMessageId, event.message?.id))
              setSession(restored.session || fallbackSession)
              setMessages(normalizeRestoredMessages(restored.recent_messages))
              setLocalMessages([])
              setPendingImages([])
              setLatestTask(null)
            } else if (event.type === 'meta') {
              if (event.title && event.title !== '新会话') {
                setSession((prev) => (prev ? { ...prev, title: event.title } : prev))
              }
            } else if (event.type === 'error') {
              flushReasoning({ endReasoning: true })
              console.error('[AiChat] 服务端错误:', event.msg)
              Toast.show({ icon: 'fail', content: '发送失败，请重试', duration: 2000 })
              updateStreamMessage((message) => applyStreamFailure(message, {
                fullText: fullText || '',
                reasoningText,
                reasoningStartTime,
                reasoningDurationMs,
                deliveryStatus: 'failed',
              }))
              setLocalMessages((prev) => finalizeOptimisticUserMessage(prev, {
                optimisticMessageId: optimisticMessage.id,
                userMessagePersisted,
              }))
              if (preserveInput) setInput(trimmedContent)
            }
          }
        }
      }
      flushReasoning({ endReasoning: true })
    } catch (err) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        flushReasoning({ endReasoning: true })
        setLocalMessages((prev) => applyStreamAbort(prev, {
          optimisticMessageId: optimisticMessage.id,
          streamMessageId,
          fullText,
          reasoningText,
          reasoningStartTime,
          reasoningDurationMs,
          userMessagePersisted,
        }))
        return
      }

      flushReasoning({ endReasoning: true })
      console.error('[AiChat] 发送消息失败:', err)
      updateStreamMessage((message) => applyStreamFailure(message, {
        fullText: fullText || '',
        reasoningText,
        reasoningStartTime,
        reasoningDurationMs,
        deliveryStatus: 'failed',
      }))
      setLocalMessages((prev) => finalizeOptimisticUserMessage(prev, {
        optimisticMessageId: optimisticMessage.id,
        userMessagePersisted,
      }))
      if (preserveInput) setInput(trimmedContent)
    } finally {
      if (throttleState.timer) {
        clearTimeout(throttleState.timer)
        throttleState.timer = null
      }
      throttleState.buffer = ''
      setSending(false)
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }, [
    fallbackSession,
    latestTask,
    navigate,
    sending,
    sessionId,
    setExpandedReasoning,
    setExpandedToolMessages,
    setInput,
    setLatestTask,
    setLocalMessages,
    setMessages,
    setPendingConfirmation,
    setPendingImages,
    setSending,
    setSession,
  ])

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  return {
    sendMessage,
    stopStreaming,
  }
}
