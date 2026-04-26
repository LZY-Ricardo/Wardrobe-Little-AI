import React, { useCallback, useEffect, useState } from 'react'
import { Button, Toast } from 'antd-mobile'
import axios from '@/api'
import { ErrorBanner, Loading, Empty } from '@/components/Feedback'
import { buildAgentContextState } from '@/utils/agentContext'
import useAgentPageEntry from '@/hooks/useAgentPageEntry'
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

const formatUpdateTime = (value) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString()
}

const buildTrendItems = (data) => {
  const candidates = [
    { key: 'reasons', label: data?.likedReasonTags?.[0] || '反馈偏好', value: 0.82, color: styles.trendBarPrimary },
    { key: 'colors', label: data?.preferredColors?.[0] || '偏好颜色', value: 0.7, color: styles.trendBarSecondary },
    { key: 'styles', label: data?.preferredStyles?.[0] || '常用风格', value: 0.62, color: styles.trendBarAccent },
  ]
  return candidates
}

export default function ProfileInsights() {
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

  useAgentPageEntry({
    enabled: Boolean(data),
    presetTask: '根据我的偏好画像给我一些建议',
    state: data
      ? buildAgentContextState({
          insight: {
            type: 'profile',
            entity: data,
          },
        })
      : null,
  })

  if (status === 'loading') return <Loading text="生成偏好画像中..." />
  if (status === 'error') return <ErrorBanner message={error} onAction={() => loadData()} />
  if (!data) return <Empty description="暂无画像数据" />

  const trendItems = buildTrendItems(data)
  const lowRiskEnabled = Boolean(data.confirmationPreferences?.lowRiskNoConfirm)

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroHeader}>
          <div>
            <div className={styles.title}>偏好画像</div>
            <div className={styles.subtitle}>基于衣橱、穿搭记录与推荐反馈生成</div>
          </div>
          <div className={styles.heroBadge}>今日更新</div>
        </div>
        <div className={styles.heroSignal}>
          <div className={styles.heroSignalLabel}>画像摘要</div>
          <div className={styles.heroSignalText}>
            {data.summary || '继续使用系统后，这里会生成更完整的画像。'}
          </div>
        </div>
        <div className={styles.heroActions}>
          <Button
            className={styles.primaryAction}
            size="small"
            color="primary"
            loading={refreshing}
            onClick={handleRefresh}
          >
            刷新画像
          </Button>
        </div>
        <div className={styles.heroMeta}>
          <div className={styles.updateTime}>更新时间：{formatUpdateTime(data.updateTime)}</div>
          <div className={styles.preferenceInline}>
            <span className={styles.preferenceLabel}>低风险操作免确认</span>
            <Button
              className={styles.preferenceButton}
              size="mini"
              color="primary"
              loading={savingPreferences}
              onClick={handlePreferenceToggle}
            >
              {lowRiskEnabled ? '已开启' : '未开启'}
            </Button>
          </div>
        </div>
      </section>

      <section className={styles.grid}>
        <div className={`${styles.card} ${styles.cardCompact}`}>
          <div className={styles.cardTitle}>偏好颜色</div>
          {renderTags(data.preferredColors, '还没有明显的颜色偏好')}
        </div>
        <div className={`${styles.card} ${styles.cardCompact}`}>
          <div className={styles.cardTitle}>常用风格</div>
          {renderTags(data.preferredStyles, '还没有明显的风格偏好')}
        </div>
        <div className={`${styles.card} ${styles.cardCompact}`}>
          <div className={styles.cardTitle}>高频场景</div>
          {renderTags(data.frequentScenes, '记录更多穿搭后会更准确')}
        </div>
        <div className={`${styles.card} ${styles.cardCompact}`}>
          <div className={styles.cardTitle}>常用季节</div>
          {renderTags(data.frequentSeasons, '继续使用后自动更新')}
        </div>
        <div className={`${styles.card} ${styles.cardWide}`}>
          <div className={styles.cardTitle}>反馈偏好</div>
          {renderTags(data.likedReasonTags, '继续提交推荐反馈后会更明显')}
        </div>
      </section>

      <section className={`${styles.card} ${styles.trendCard}`}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>反馈偏好趋势</div>
          <span className={styles.cardHeaderHint}>轻量洞察</span>
        </div>
        <div className={styles.trendList}>
          {trendItems.map((item) => (
            <div key={item.key} className={styles.trendItem}>
              <span className={styles.trendLabel}>{item.label}</span>
              <div className={styles.trendTrack}>
                <div
                  className={`${styles.trendBar} ${item.color}`}
                  style={{ width: `${Math.round(item.value * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className={styles.recommendationNote}>
          <span className={styles.recommendationText}>通勤轻搭更匹配当前画像</span>
          <span className={styles.recommendationBadge}>匹配度高</span>
        </div>
      </section>
    </div>
  )
}
