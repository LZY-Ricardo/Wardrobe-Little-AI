import React, { useEffect, useMemo, useState } from 'react'
import { Button, Toast } from 'antd-mobile'
import axios from '@/api'
import styles from './index.module.less'
import { Loading, ErrorBanner, Empty } from '@/components/Feedback'

const FEEDBACK_OPTIONS = [
  { value: 'like', label: '喜欢' },
  { value: 'neutral', label: '一般' },
  { value: 'dislike', label: '不喜欢' },
]

const REASON_OPTIONS = ['太正式', '太休闲', '颜色不喜欢', '季节不合适', '搭配太复杂']

const toSummaryText = (summary = {}) => {
  const suitCount = Number(summary?.suitCount || 0)
  const itemCount = Number(summary?.itemCount || 0)
  const reasons = Array.isArray(summary?.reasons) ? summary.reasons.filter(Boolean) : []
  return [
    suitCount ? `${suitCount} 套推荐` : '',
    itemCount ? `${itemCount} 件单品` : '',
    reasons.length ? reasons.join(' / ') : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

export default function RecommendationHistory() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [feedbackResult, setFeedbackResult] = useState('like')
  const [reasonTags, setReasonTags] = useState([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const loadHistory = async () => {
    setStatus('loading')
    setError('')
    try {
      const res = await axios.get('/recommendations')
      const list = Array.isArray(res?.data) ? res.data : []
      setItems(list)
      setStatus('success')
    } catch (err) {
      console.error('获取推荐历史失败:', err)
      setError('获取推荐历史失败，请稍后重试')
      setStatus('error')
    }
  }

  useEffect(() => {
    void loadHistory()
  }, [])

  const currentFeedback = useMemo(
    () => items.find((item) => item.id === expandedId) || null,
    [items, expandedId]
  )

  useEffect(() => {
    if (!currentFeedback) {
      setFeedbackResult('like')
      setReasonTags([])
      setNote('')
      return
    }
    setFeedbackResult(currentFeedback.feedback_result || 'like')
    setReasonTags(Array.isArray(currentFeedback.feedback_reason_tags) ? currentFeedback.feedback_reason_tags : [])
    setNote(currentFeedback.feedback_note || '')
  }, [currentFeedback])

  const handleAdopt = async (item, patch) => {
    try {
      const res = await axios.put(`/recommendations/${item.id}/adopt`, patch)
      const next = res?.data
      setItems((prev) => prev.map((row) => (row.id === item.id ? next : row)))
      Toast.show({ content: '状态已更新', duration: 900 })
    } catch (err) {
      console.error('更新推荐状态失败:', err)
      Toast.show({ content: '更新失败，请重试', duration: 1200 })
    }
  }

  const toggleReason = (reason) => {
    setReasonTags((prev) =>
      prev.includes(reason) ? prev.filter((item) => item !== reason) : [...prev, reason]
    )
  }

  const handleSubmitFeedback = async () => {
    if (!expandedId) return
    setSaving(true)
    try {
      const res = await axios.post(`/recommendations/${expandedId}/feedback`, {
        feedbackResult,
        reasonTags,
        note,
      })
      const next = res?.data
      setItems((prev) => prev.map((row) => (row.id === expandedId ? next : row)))
      setExpandedId(null)
      Toast.show({ content: '反馈已保存', duration: 900 })
    } catch (err) {
      console.error('提交反馈失败:', err)
      Toast.show({ content: '提交失败，请重试', duration: 1200 })
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') return <Loading text="加载推荐历史中..." />
  if (status === 'error') return <ErrorBanner message={error} onAction={loadHistory} />
  if (!items.length) return <Empty description="还没有推荐历史" />

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.title}>推荐历史</div>
        <div className={styles.subtitle}>查看推荐结果、采纳状态与反馈记录</div>
      </div>
      <div className={styles.list}>
        {items.map((item) => (
          <div className={styles.card} key={item.id}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.scene}>{item.scene || '通用场景'}</div>
                <div className={styles.meta}>
                  {new Date(item.create_time).toLocaleString()}
                </div>
              </div>
              <div className={styles.badges}>
                <span className={styles.badge}>{item.trigger_source || 'recommend-page'}</span>
                {item.adopted ? <span className={styles.badgeActive}>已采纳</span> : null}
              </div>
            </div>

            <div className={styles.summary}>{toSummaryText(item.result_summary)}</div>

            <div className={styles.actionRow}>
              {(() => {
                const lockedAdoption = Boolean(item.saved_as_suit || item.saved_as_outfit_log)
                const label = item.adopted ? '已采纳' : '标记采纳'
                return (
              <Button
                size="small"
                color={item.adopted ? 'success' : 'primary'}
                disabled={item.adopted && lockedAdoption}
                onClick={() =>
                  handleAdopt(item, {
                    adopted: item.adopted ? 0 : 1,
                    saved_as_suit: item.saved_as_suit,
                    saved_as_outfit_log: item.saved_as_outfit_log,
                  })
                }
              >
                {label}
              </Button>
                )
              })()}
              <Button
                size="small"
                fill="outline"
                onClick={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
              >
                {expandedId === item.id ? '收起反馈' : '填写反馈'}
              </Button>
            </div>

            {expandedId === item.id ? (
              <div className={styles.feedbackPanel}>
                <div className={styles.feedbackTitle}>推荐反馈</div>
                <div className={styles.feedbackOptions}>
                  {FEEDBACK_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.optionButton} ${
                        feedbackResult === option.value ? styles.optionButtonActive : ''
                      }`}
                      onClick={() => setFeedbackResult(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className={styles.reasonList}>
                  {REASON_OPTIONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      className={`${styles.reasonButton} ${
                        reasonTags.includes(reason) ? styles.reasonButtonActive : ''
                      }`}
                      onClick={() => toggleReason(reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>

                <textarea
                  className={styles.textarea}
                  placeholder="补充说明这次推荐的感受"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />

                <Button
                  block
                  color="primary"
                  loading={saving}
                  onClick={handleSubmitFeedback}
                >
                  保存反馈
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
