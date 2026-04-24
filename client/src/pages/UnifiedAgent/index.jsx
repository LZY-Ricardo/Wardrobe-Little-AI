import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Toast } from 'antd-mobile'
import axios from '@/api'
import { ErrorBanner, Empty, Loading } from '@/components/Feedback'
import AgentSessionList from '@/components/AgentSessionList'
import { useLocation } from 'react-router-dom'
import styles from './index.module.less'

const renderTask = (task) => {
  if (!task) return null
  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>当前任务结果</div>
      <div className={styles.cardText}>类型：{task.taskType}</div>
      <div className={styles.cardText}>摘要：{task.summary}</div>
      {task.executionPreview ? (
        <div className={styles.previewBlock}>
          <div className={styles.previewTitle}>{task.executionPreview.intent}</div>
          <div className={styles.cardText}>{task.executionPreview.why}</div>
          <div className={styles.previewSteps}>
            {task.executionPreview.steps.map((step, index) => (
              <div className={styles.previewStep} key={`${step}-${index}`}>
                <span className={styles.previewIndex}>{index + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {task.result?.suits?.length ? (
        <div className={styles.messageList}>
          {task.result.suits.map((item, index) => (
            <div key={`${item.scene}-${index}`} className={styles.messageItem}>
              <strong>{item.scene || '通用场景'}</strong>
              <span>{item.reason}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function UnifiedAgent() {
  const location = useLocation()
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [restorePayload, setRestorePayload] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [latestTask, setLatestTask] = useState(null)
  const [pendingConfirmation, setPendingConfirmation] = useState(null)
  const presetTask = location.state?.presetTask || ''
  const [contextTask, setContextTask] = useState(location.state?.latestResult || null)
  const [contextCloth, setContextCloth] = useState(location.state?.selectedCloth || null)
  const [contextProfile, setContextProfile] = useState(location.state?.latestProfile || null)

  useEffect(() => {
    if (presetTask) setInput(String(presetTask))
  }, [presetTask])

  useEffect(() => {
    if (location.state?.latestResult) setContextTask(location.state.latestResult)
    if (location.state?.selectedCloth) setContextCloth(location.state.selectedCloth)
    if (location.state?.latestProfile) setContextProfile(location.state.latestProfile)
  }, [location.state])

  const createSession = async () => {
    const res = await axios.post('/unified-agent/sessions', {
      firstMessage: '新会话',
    })
    const payload = res?.data || null
    if (!payload) return
    setActiveSession(payload.session)
    setRestorePayload(payload)
    await loadSessions()
  }

  const loadSessions = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const res = await axios.get('/unified-agent/sessions')
      const list = Array.isArray(res?.data) ? res.data : []
      setSessions(list)
      setStatus('success')
      if (!list.length) {
        setActiveSession(null)
        setRestorePayload(null)
        return
      }
      if (!activeSession) {
        const first = list[0]
        setActiveSession(first)
        const restore = await axios.get(`/unified-agent/sessions/${first.id}`)
        setRestorePayload(restore?.data || null)
      }
    } catch (err) {
      console.error('加载统一 Agent 会话失败:', err)
      setError('加载会话失败，请稍后重试')
      setStatus('error')
    }
  }, [activeSession])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  const handleSelect = async (session) => {
    setActiveSession(session)
    const restore = await axios.get(`/unified-agent/sessions/${session.id}`)
    setRestorePayload(restore?.data || null)
  }

  const handleSend = async () => {
    if (!activeSession?.id) return
    const content = String(input || '').trim()
    if (!content) {
      Toast.show({ content: '请输入消息', duration: 1000 })
      return
    }
    setSending(true)
    try {
      const res = await axios.post(`/unified-agent/sessions/${activeSession.id}/chat`, {
        input: content,
        latestTask: latestTask || contextTask,
      })
      setRestorePayload(res?.data?.restored || null)
      const task = res?.data?.latest_task || null
      setLatestTask(task)
      setPendingConfirmation(task?.requiresConfirmation ? task.confirmation : null)
      if (task?.taskType === 'recommendation') setContextTask(task)
      setInput('')
    } catch (err) {
      console.error('发送统一 Agent 消息失败:', err)
      Toast.show({ content: err?.msg || '发送失败，请重试', duration: 1200 })
    } finally {
      setSending(false)
    }
  }

  const handleConfirm = async () => {
    if (!activeSession?.id || !pendingConfirmation?.confirmId) return
    setSending(true)
    try {
      const res = await axios.post(`/unified-agent/sessions/${activeSession.id}/confirm`, {
        confirmId: pendingConfirmation.confirmId,
      })
      setRestorePayload(res?.data?.restored || null)
      const task = res?.data?.latest_task || null
      setLatestTask(task)
      if (task?.taskType === 'toggle_favorite') {
        setContextCloth((prev) => (prev ? { ...prev, favorite: task?.result?.favorite ? 1 : 0 } : prev))
      }
      if (task?.taskType === 'update_confirmation_preferences' && task?.result?.confirmationPreferences) {
        setContextProfile(task.result)
      }
      setPendingConfirmation(null)
    } catch (err) {
      console.error('统一 Agent 确认失败:', err)
      Toast.show({ content: err?.msg || '确认失败，请重试', duration: 1200 })
    } finally {
      setSending(false)
    }
  }

  const handleCancel = async () => {
    if (!activeSession?.id || !pendingConfirmation?.confirmId) return
    try {
      const res = await axios.post(`/unified-agent/sessions/${activeSession.id}/cancel`, {
        confirmId: pendingConfirmation.confirmId,
      })
      setRestorePayload(res?.data?.restored || null)
      setLatestTask(null)
      setPendingConfirmation(null)
    } catch (err) {
      console.error('统一 Agent 取消失败:', err)
      Toast.show({ content: err?.msg || '取消失败，请重试', duration: 1200 })
    }
  }

  const effectiveTask = useMemo(() => latestTask || contextTask, [latestTask, contextTask])

  const handleInlineAction = async (action) => {
    if (!activeSession?.id) return
    setSending(true)
    try {
      const res = await axios.post(`/unified-agent/sessions/${activeSession.id}/chat`, {
        input:
          action === 'save_suit'
            ? '把当前推荐的第1套保存为套装'
            : action === 'create_outfit_log'
              ? '把当前推荐的第1套记录为穿搭'
              : action === 'toggle_favorite'
                ? '切换当前衣物收藏状态'
                : `${contextProfile?.confirmationPreferences?.lowRiskNoConfirm ? '关闭' : '开启'}低风险免确认`,
        latestTask:
          action === 'toggle_favorite'
            ? { selectedCloth: contextCloth }
            : action === 'update_confirmation_preferences'
              ? { nextLowRiskNoConfirm: !contextProfile?.confirmationPreferences?.lowRiskNoConfirm }
              : effectiveTask,
      })
      setRestorePayload(res?.data?.restored || null)
      const task = res?.data?.latest_task || null
      setLatestTask(task)
      setPendingConfirmation(task?.requiresConfirmation ? task.confirmation : null)
      if (action === 'toggle_favorite' && task?.status === 'success') {
        setContextCloth((prev) => (prev ? { ...prev, favorite: task?.result?.favorite ? 1 : 0 } : prev))
      }
      if (action === 'update_confirmation_preferences' && task?.status === 'success' && task?.result?.confirmationPreferences) {
        setContextProfile(task.result)
      }
    } catch (err) {
      console.error('统一 Agent 内联操作失败:', err)
      Toast.show({ content: err?.msg || '执行失败，请重试', duration: 1200 })
    } finally {
      setSending(false)
    }
  }

  if (status === 'loading') return <Loading text="加载统一 Agent 中..." />
  if (status === 'error') return <ErrorBanner message={error} onAction={loadSessions} />

  return (
    <div className={styles.page}>
      <AgentSessionList
        sessions={sessions}
        activeSessionId={activeSession?.id}
        onSelect={(session) => void handleSelect(session)}
        onCreate={() => void createSession()}
      />
      <section className={styles.main}>
        {!restorePayload ? (
          <Empty description="还没有会话，先新建一个吧" />
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.title}>{restorePayload.session?.title || '统一 Agent'}</div>
              <div className={styles.subtitle}>
                最近消息 {restorePayload.recent_messages?.length || 0} 条
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle}>会话摘要</div>
              <div className={styles.cardText}>
                {restorePayload.session_memory?.summary || '当前会话还没有摘要，后续长对话将自动生成。'}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle}>长期偏好</div>
              <div className={styles.cardText}>
                {restorePayload.preference_summary?.summary || '当前还没有明显的长期偏好摘要。'}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle}>最近 12 轮消息</div>
              {!restorePayload.recent_messages?.length ? (
                <Empty description="当前会话还没有消息" />
              ) : (
                <div className={styles.messageList}>
                  {restorePayload.recent_messages.map((item) => (
                    <div key={item.id} className={styles.messageItem}>
                      <strong>{item.role}</strong>
                      <span>{item.content}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {renderTask(effectiveTask)}
            {effectiveTask?.taskType === 'recommendation' && !pendingConfirmation ? (
              <div className={styles.card}>
                <div className={styles.cardTitle}>推荐后续动作</div>
                <div className={styles.confirmActions}>
                  <Button color="primary" loading={sending} onClick={() => handleInlineAction('save_suit')}>
                    保存第 1 套为套装
                  </Button>
                  <Button fill="outline" onClick={() => handleInlineAction('create_outfit_log')}>
                    记录第 1 套穿搭
                  </Button>
                </div>
              </div>
            ) : null}
            {contextCloth && !pendingConfirmation ? (
              <div className={styles.card}>
                <div className={styles.cardTitle}>当前衣物</div>
                <div className={styles.cardText}>{contextCloth.name || contextCloth.type}</div>
                <div className={styles.confirmActions}>
                  <Button color="primary" loading={sending} onClick={() => handleInlineAction('toggle_favorite')}>
                    {contextCloth.favorite ? '取消收藏当前衣物' : '收藏当前衣物'}
                  </Button>
                </div>
              </div>
            ) : null}
            {contextProfile ? (
              <div className={styles.card}>
                <div className={styles.cardTitle}>Agent 确认偏好</div>
                <div className={styles.cardText}>
                  低风险免确认：{contextProfile.confirmationPreferences?.lowRiskNoConfirm ? '已开启' : '未开启'}
                </div>
                <div className={styles.confirmActions}>
                  <Button fill="outline" loading={sending} onClick={() => handleInlineAction('update_confirmation_preferences')}>
                    {contextProfile.confirmationPreferences?.lowRiskNoConfirm ? '关闭低风险免确认' : '开启低风险免确认'}
                  </Button>
                </div>
              </div>
            ) : null}
            {pendingConfirmation ? (
              <div className={styles.card}>
                <div className={styles.cardTitle}>待确认操作</div>
                <div className={styles.cardText}>确认码：{pendingConfirmation.confirmId}</div>
                <div className={styles.cardText}>影响范围：{pendingConfirmation.scope}</div>
                <div className={styles.cardText}>风险提示：{pendingConfirmation.risk}</div>
                <div className={styles.confirmActions}>
                  <Button color="primary" loading={sending} onClick={handleConfirm}>
                    确认执行
                  </Button>
                  <Button fill="outline" onClick={handleCancel}>
                    取消
                  </Button>
                </div>
              </div>
            ) : null}
            <div className={styles.card}>
              <div className={styles.cardTitle}>发送消息</div>
              <textarea
                className={styles.textarea}
                placeholder="在统一 Agent 会话中继续输入..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <Button color="primary" block loading={sending} onClick={handleSend}>
                发送
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
