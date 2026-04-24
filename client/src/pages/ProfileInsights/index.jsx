import React, { useCallback, useEffect, useState } from 'react'
import { Button, Toast } from 'antd-mobile'
import axios from '@/api'
import { ErrorBanner, Loading, Empty } from '@/components/Feedback'
import { useNavigate } from 'react-router-dom'
import styles from './index.module.less'

const renderTags = (items = [], emptyText = '暂无') => {
  if (!Array.isArray(items) || !items.length) {
    return <div className={styles.emptyText}>{emptyText}</div>
  }
  return (
    <div className={styles.tagList}>
      {items.map((item) => (
        <span key={item} className={styles.tag}>
          {item}
        </span>
      ))}
    </div>
  )
}

export default function ProfileInsights() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)

  const loadData = useCallback(async (forceRefresh = false) => {
    setStatus('loading')
    setError('')
    try {
      const res = forceRefresh
        ? await axios.post('/profile-insights/refresh')
        : await axios.get('/profile-insights')
      setData(res?.data || null)
      setStatus('success')
    } catch (err) {
      console.error('获取画像失败:', err)
      setError('获取画像失败，请稍后重试')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData(true)
    setRefreshing(false)
  }

  const handlePreferenceToggle = async () => {
    if (!data) return
    setSavingPreferences(true)
    try {
      const res = await axios.post('/profile-insights/preferences', {
        lowRiskNoConfirm: !data.confirmationPreferences?.lowRiskNoConfirm,
      })
      setData(res?.data || null)
      Toast.show({ content: '确认偏好已更新', duration: 1000 })
    } catch (err) {
      console.error('更新确认偏好失败:', err)
      Toast.show({ content: err?.msg || '更新失败，请重试', duration: 1200 })
    } finally {
      setSavingPreferences(false)
    }
  }

  if (status === 'loading') return <Loading text="生成偏好画像中..." />
  if (status === 'error') return <ErrorBanner message={error} onAction={() => loadData()} />
  if (!data) return <Empty description="暂无画像数据" />

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <div className={styles.title}>偏好画像</div>
          <div className={styles.subtitle}>基于衣橱、穿搭记录与推荐反馈生成</div>
        </div>
        <Button size="small" color="primary" loading={refreshing} onClick={handleRefresh}>
          刷新画像
        </Button>
        <Button
          size="small"
          fill="outline"
          onClick={() =>
            navigate('/unified-agent', {
              state: {
                presetTask: '根据我的偏好画像给我一些建议',
                latestProfile: data,
              },
            })
          }
        >
          交给 Agent
        </Button>
      </div>

      <div className={styles.summaryCard}>
        <div className={styles.cardTitle}>画像摘要</div>
        <div className={styles.summaryText}>{data.summary || '继续使用系统后，这里会生成更完整的画像。'}</div>
        <div className={styles.updateTime}>
          更新时间：{data.updateTime ? new Date(data.updateTime).toLocaleString() : '--'}
        </div>
        <div className={styles.preferenceRow}>
          <span>低风险操作免确认</span>
          <Button size="mini" color="primary" loading={savingPreferences} onClick={handlePreferenceToggle}>
            {data.confirmationPreferences?.lowRiskNoConfirm ? '已开启' : '未开启'}
          </Button>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>偏好颜色</div>
          {renderTags(data.preferredColors, '还没有明显的颜色偏好')}
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>常用风格</div>
          {renderTags(data.preferredStyles, '还没有明显的风格偏好')}
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>高频场景</div>
          {renderTags(data.frequentScenes, '记录更多穿搭后会更准确')}
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>常用季节</div>
          {renderTags(data.frequentSeasons, '继续使用后自动更新')}
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>反馈偏好</div>
          {renderTags(data.likedReasonTags, '继续提交推荐反馈后会更明显')}
        </div>
      </div>
    </div>
  )
}
