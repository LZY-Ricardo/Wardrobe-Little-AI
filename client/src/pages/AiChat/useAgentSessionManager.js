import { useCallback, useEffect } from 'react'
import { Dialog, Toast } from 'antd-mobile'
import axios from '@/api'
import {
  resolveConfirmedSessionState,
  resolveLoadedSessionState,
} from './sessionState'

export default function useAgentSessionManager({
  sessionId,
  prefillText,
  shouldOpenHistoryFromQuery,
  fallbackSession,
  initialLatestTask,
  session,
  renaming,
  sending,
  navigate,
  setSession,
  setSessionList,
  setMessages,
  setLocalMessages,
  setStatus,
  setError,
  setLatestTask,
  setPendingConfirmation,
  setHistoryVisible,
  setActionsVisible,
  setRenaming,
  setSending,
}) {
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
      const nextState = resolveLoadedSessionState({
        payload: res?.data || {},
        fallbackSession,
        initialLatestTask,
      })
      setSession(nextState.session)
      setMessages(nextState.messages)
      setLocalMessages([])
      setPendingConfirmation(nextState.pendingConfirmation)
      setLatestTask(nextState.latestTask)
      setStatus('success')
    } catch (loadError) {
      console.error('加载会话失败:', loadError)
      setError('加载会话失败，请稍后重试')
      setStatus('error')
    }
  }, [
    fallbackSession,
    initialLatestTask,
    prefillText,
    sessionId,
    setError,
    setLatestTask,
    setLocalMessages,
    setMessages,
    setPendingConfirmation,
    setSession,
    setStatus,
  ])

  const loadSessionList = useCallback(async () => {
    try {
      const res = await axios.get('/unified-agent/sessions')
      setSessionList(Array.isArray(res?.data) ? res.data : [])
    } catch (loadError) {
      console.error('加载会话列表失败:', loadError)
      Toast.show({ icon: 'fail', content: '加载历史会话失败', duration: 1200 })
    }
  }, [setSessionList])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!shouldOpenHistoryFromQuery) return
    setHistoryVisible(true)
  }, [setHistoryVisible, shouldOpenHistoryFromQuery])

  const confirmPendingAction = useCallback(async (confirmId) => {
    if (!confirmId || !Number.isFinite(sessionId) || sending) return
    setSending(true)
    try {
      const res = await axios.post(`/unified-agent/sessions/${sessionId}/confirm`, {
        confirmId,
      })
      const nextState = resolveConfirmedSessionState({
        payload: res?.data || {},
        fallbackSession,
      })
      setSession(nextState.session)
      setMessages(nextState.messages)
      setLatestTask(nextState.latestTask)
      setPendingConfirmation(nextState.pendingConfirmation)
    } catch (actionError) {
      console.error('确认操作失败:', actionError)
      await loadSession()
      setPendingConfirmation(null)
    } finally {
      setSending(false)
    }
  }, [
    fallbackSession,
    loadSession,
    sending,
    sessionId,
    setLatestTask,
    setMessages,
    setPendingConfirmation,
    setSending,
    setSession,
  ])

  const cancelPendingAction = useCallback(async (confirmId) => {
    if (!confirmId || !Number.isFinite(sessionId) || sending) return
    setSending(true)
    try {
      const res = await axios.post(`/unified-agent/sessions/${sessionId}/cancel`, {
        confirmId,
      })
      const nextState = resolveConfirmedSessionState({
        payload: res?.data || {},
        fallbackSession,
      })
      setSession(nextState.session)
      setMessages(nextState.messages)
      setLatestTask(nextState.latestTask)
      setPendingConfirmation(nextState.pendingConfirmation)
    } catch (actionError) {
      console.error('取消操作失败:', actionError)
      await loadSession()
      setPendingConfirmation(null)
    } finally {
      setSending(false)
    }
  }, [
    fallbackSession,
    loadSession,
    sending,
    sessionId,
    setLatestTask,
    setMessages,
    setPendingConfirmation,
    setSending,
    setSession,
  ])

  const openHistory = useCallback(() => {
    setActionsVisible(false)
    void loadSessionList()
    setHistoryVisible(true)
  }, [loadSessionList, setActionsVisible, setHistoryVisible])

  const expandHistoryPage = useCallback(() => {
    setHistoryVisible(false)
    if (Number.isFinite(sessionId)) {
      navigate(`/agent/history?sessionId=${sessionId}`, {
        state: { session },
      })
      return
    }
    navigate('/agent/history')
  }, [navigate, session, sessionId, setHistoryVisible])

  const openActions = useCallback(() => {
    setHistoryVisible(false)
    setActionsVisible(true)
  }, [setActionsVisible, setHistoryVisible])

  const createNewSession = useCallback(async () => {
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
  }, [navigate, setActionsVisible])

  const selectHistorySession = useCallback((targetSession) => {
    setHistoryVisible(false)
    if (!targetSession?.id || targetSession.id === sessionId) return
    navigate(`/aichat?sessionId=${targetSession.id}`, {
      replace: true,
      state: { session: targetSession },
    })
  }, [navigate, sessionId, setHistoryVisible])

  const renameSession = useCallback(async (currentTitle = '新对话') => {
    if (!Number.isFinite(sessionId) || renaming) return

    const nextTitle = window.prompt('请输入新的会话标题', currentTitle)
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
  }, [
    loadSessionList,
    renaming,
    session,
    sessionId,
    setActionsVisible,
    setRenaming,
    setSession,
  ])

  const deleteSession = useCallback(async () => {
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
  }, [navigate, sessionId, setActionsVisible])

  return {
    loadSession,
    loadSessionList,
    confirmPendingAction,
    cancelPendingAction,
    openHistory,
    expandHistoryPage,
    openActions,
    createNewSession,
    selectHistorySession,
    renameSession,
    deleteSession,
  }
}
