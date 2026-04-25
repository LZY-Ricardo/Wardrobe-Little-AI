import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ErrorBanner, Empty, Loading } from '@/components/Feedback'
import axios from '@/api'
import { useLocation, useNavigate } from 'react-router-dom'
import styles from './index.module.less'

const QUICK_ACTIONS = ['今日穿什么', '场景推荐', '项目使用帮助']

const looksCorrupted = (text = '') => /[�]|[ÃÅæçéêëîïôöùûüÿÐÑØ×]/.test(String(text))

const normalizeSessionText = (text = '', fallback = 'chat') => {
  const value = String(text || '').trim()
  if (!value) return fallback
  return looksCorrupted(value) ? fallback : value
}

const summarizePreviewText = (text = '', fallback = 'chat', maxLength = 48) => {
  const normalized = normalizeSessionText(text, fallback)
  const plainText = normalized
    .replace(/```[\s\S]*?```/g, ' ') 
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plainText) return fallback
  return plainText.length > maxLength ? `${plainText.slice(0, maxLength).trim()}...` : plainText
}

const formatTime = (value) => {
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

const buildPreview = (session) => {
  const fallback = normalizeSessionText(session?.current_task_type, 'chat')
  const preview = normalizeSessionText(session?.last_message_preview, '')
  return summarizePreviewText(preview, fallback)
}

export default function UnifiedAgent() {
  const navigate = useNavigate()
  const location = useLocation()
  const presetTask = String(location.state?.presetTask || '').trim()
  const contextualState = useMemo(
    () => ({
      latestResult: location.state?.latestResult || null,
      selectedCloth: location.state?.selectedCloth || null,
      selectedSuit: location.state?.selectedSuit || null,
      selectedOutfitLog: location.state?.selectedOutfitLog || null,
      latestProfile: location.state?.latestProfile || null,
      latestAnalytics: location.state?.latestAnalytics || null,
      latestWeather: location.state?.latestWeather || null,
      styleProfile: location.state?.styleProfile || null,
      recommendationHistory: location.state?.recommendationHistory || null,
      manualSuitDraft: location.state?.manualSuitDraft || null,
      manualOutfitLogDraft: location.state?.manualOutfitLogDraft || null,
      prefillImages: Array.isArray(location.state?.prefillImages) ? location.state.prefillImages : [],
    }),
    [location.state],
  )

  const [sessions, setSessions] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const loadSessions = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const res = await axios.get('/unified-agent/sessions')
      const list = Array.isArray(res?.data) ? res.data : []
      setSessions(list)
      setStatus('success')
    } catch (err) {
      console.error('加载 Agent 会话失败:', err)
      setError('加载会话失败，请稍后重试')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const createSession = useCallback(
    async (firstMessage = '新会话', { prefill, contextState } = {}) => {
      if (creating) return
      setCreating(true)
      try {
        const res = await axios.post('/unified-agent/sessions', {
          firstMessage,
        })
        const payload = res?.data || null
        if (payload?.session?.id) {
          const query = prefill ? `&prefill=${encodeURIComponent(prefill)}` : ''
          navigate(`/aichat?sessionId=${payload.session.id}${query}`, {
            state: { session: payload.session, ...(contextState || {}) },
          })
          return
        }
        await loadSessions()
      } catch (err) {
        console.error('创建 Agent 会话失败:', err)
        setError('创建会话失败，请稍后重试')
        setStatus('error')
      } finally {
        setCreating(false)
      }
    },
    [creating, loadSessions, navigate],
  )

  useEffect(() => {
    if (!presetTask) return
    void createSession(presetTask, {
      prefill: presetTask,
      contextState: contextualState,
    })
  }, [contextualState, createSession, presetTask])

  const latestSession = sessions[0] || null
  const otherSessions = useMemo(() => sessions.slice(1, 3), [sessions])

  const handleOpenSession = useCallback(
    (session) => {
      if (!session?.id) return
      navigate(`/aichat?sessionId=${session.id}`, {
        state: { session },
      })
    },
    [navigate],
  )

  const handleQuickAction = useCallback(
    (label) => {
      navigate(`/aichat?prefill=${encodeURIComponent(label)}`)
    },
    [navigate],
  )

  const handleOpenAllHistory = useCallback(() => {
    if (latestSession?.id) {
      navigate(`/agent/history?sessionId=${latestSession.id}`, {
        state: { session: latestSession },
      })
      return
    }

    navigate('/agent/history')
  }, [latestSession, navigate])

  return (
    <div className={styles.page}>
      <div className={styles.heroBg} />

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Agent</h1>
          <p className={styles.subtitle}>最近会话 · 快捷开始</p>
        </div>
        <button type="button" className={styles.newButton} onClick={() => createSession()} disabled={creating}>
          {creating ? '创建中' : '新建'}
        </button>
      </header>

      {status === 'loading' ? <Loading text="加载 Agent 中..." /> : null}
      {status === 'error' ? <ErrorBanner title="加载失败" description={error} onRetry={() => void loadSessions()} /> : null}

      {status === 'success' ? (
        <main className={styles.content}>
          {latestSession ? (
            <button type="button" className={styles.primaryCard} onClick={() => handleOpenSession(latestSession)}>
              <span className={styles.primaryLabel}>继续上次对话</span>
              <strong className={styles.primaryTitle}>{normalizeSessionText(latestSession.title, '未命名会话')}</strong>
              <span className={styles.primaryTime}>{formatTime(latestSession.last_message_at)}</span>
              <span className={styles.primaryPreview}>{buildPreview(latestSession)}</span>
            </button>
          ) : (
            <Empty title="还没有 Agent 会话" description="开始一次对话后，会在这里看到记录。" />
          )}

          <section className={styles.section}>
            <div className={styles.sectionTitle}>快速开始</div>
            <div className={styles.quickActions}>
              {QUICK_ACTIONS.map((item) => (
                <button key={item} type="button" className={styles.quickChip} onClick={() => handleQuickAction(item)}>
                  {item}
                </button>
              ))}
            </div>
          </section>

          {otherSessions.length ? (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>最近会话</div>
                <button type="button" className={styles.sectionLink} onClick={handleOpenAllHistory}>
                  查看全部
                </button>
              </div>
              <div className={styles.sessionList}>
                {otherSessions.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className={styles.sessionCard}
                    onClick={() => handleOpenSession(session)}
                  >
                    <strong className={styles.sessionTitle}>{normalizeSessionText(session.title, '未命名会话')}</strong>
                    <span className={styles.sessionMeta}>{formatTime(session.last_message_at)}</span>
                    <span className={styles.sessionPreview}>{buildPreview(session)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </main>
      ) : null}
    </div>
  )
}
