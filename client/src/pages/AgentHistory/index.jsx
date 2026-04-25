import { useCallback, useEffect, useMemo, useState } from 'react'
import { Toast } from 'antd-mobile'
import { useLocation, useNavigate } from 'react-router-dom'
import AgentHistoryPanel from '@/components/AgentHistoryPanel'
import axios from '@/api'
import styles from './index.module.less'

export default function AgentHistory() {
  const navigate = useNavigate()
  const location = useLocation()

  const sessionId = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return Number.parseInt(search.get('sessionId') || '', 10)
  }, [location.search])

  const fallbackSession = location.state?.session || null
  const [session] = useState(fallbackSession)
  const [sessionList, setSessionList] = useState([])

  const loadSessionList = useCallback(async () => {
    try {
      const res = await axios.get('/unified-agent/sessions')
      setSessionList(Array.isArray(res?.data) ? res.data : [])
    } catch (error) {
      console.error('加载历史会话失败:', error)
      Toast.show({ icon: 'fail', content: '加载历史会话失败', duration: 1200 })
    }
  }, [])

  useEffect(() => {
    void loadSessionList()
  }, [loadSessionList])

  const requestDeleteSession = useCallback(
    async (targetSessionId) => {
      try {
        await axios.delete(`/unified-agent/sessions/${targetSessionId}`)
        Toast.show({ icon: 'success', content: '已删除', duration: 1000 })
        setSessionList((prev) => prev.filter((item) => item.id !== targetSessionId))

        if (targetSessionId === sessionId) {
          navigate('/unified-agent', { replace: true })
        }

        return true
      } catch (error) {
        console.error('删除历史会话失败:', error)
        Toast.show({ icon: 'fail', content: '删除失败', duration: 1200 })
        return false
      }
    },
    [navigate, sessionId],
  )

  const handleSelectSession = useCallback(
    (targetSession) => {
      if (!targetSession?.id) return
      navigate(`/aichat?sessionId=${targetSession.id}`, {
        replace: true,
        state: { session: targetSession },
      })
    },
    [navigate],
  )

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate('/unified-agent', { replace: true })
  }, [navigate])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={handleBack} aria-label="返回">
          ‹
        </button>
        <div className={styles.title}>历史会话</div>
        <div className={styles.headerSpacer} />
      </header>

      <AgentHistoryPanel
        sessionId={sessionId}
        session={session}
        sessionList={sessionList}
        loadSessionList={loadSessionList}
        requestDeleteSession={requestDeleteSession}
        onSelectSession={handleSelectSession}
        embedded={false}
      />
    </div>
  )
}
