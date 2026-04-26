import React, { useCallback, useEffect, useState } from 'react'
import axios from '@/api'
import { ErrorBanner, Loading, Empty } from '@/components/Feedback'
import { buildAgentContextState } from '@/utils/agentContext'
import useAgentPageEntry from '@/hooks/useAgentPageEntry'
import { buildCompactStats } from './statsViewModel'
import { buildWardrobeAnalyticsViewModel } from './viewModel'
import styles from './index.module.less'

const renderStats = (items = [], emptyText = '暂无数据') => {
  if (!Array.isArray(items) || !items.length) {
    return <div className={styles.emptyText}>{emptyText}</div>
  }
  return (
    <div className={styles.list}>
      {items.map((item) => (
        <div key={item.label || item.date} className={styles.listItem}>
          <span className={styles.listItemLabel}>{item.label || item.date}</span>
          <strong>{item.count}</strong>
        </div>
      ))}
    </div>
  )
}

export default function WardrobeAnalytics() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const res = await axios.get('/profile-insights/analytics')
      setData(res?.data || null)
      setStatus('success')
    } catch (err) {
      console.error('获取分析数据失败:', err)
      setError('获取分析数据失败，请稍后重试')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useAgentPageEntry({
    enabled: Boolean(data),
    presetTask: '结合当前衣橱分析，给我总结重点并告诉我下一步该怎么整理',
    state: data
      ? buildAgentContextState({
          insight: {
            type: 'analytics',
            entity: data,
          },
        })
      : null,
  })

  if (status === 'loading') return <Loading text="分析你的衣橱中..." />
  if (status === 'error') return <ErrorBanner message={error} onAction={loadData} />
  if (!data) return <Empty description="暂无分析数据" />

  const viewModel = buildWardrobeAnalyticsViewModel(data)
  const compactStyleDistribution = buildCompactStats(data.styleDistribution, {
    maxItems: 4,
    overflowLabel: '其他风格',
  })

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroText}>
            <div className={styles.title}>衣橱分析</div>
            <div className={styles.subtitle}>从衣物结构、使用记录和推荐采纳情况观察你的穿搭习惯</div>
          </div>
        </div>
        <div className={styles.heroInsight}>
          <div className={styles.heroInsightLabel}>{viewModel.heroInsightLabel}</div>
          <div className={styles.heroInsightText}>{viewModel.heroInsightText}</div>
        </div>
      </section>

      <section className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{data.totalClothes}</div>
          <div className={styles.summaryLabel}>衣物总数</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{data.recommendationSummary.total}</div>
          <div className={styles.summaryLabel}>推荐次数</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{data.recommendationSummary.adopted}</div>
          <div className={styles.summaryLabel}>已采纳</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{data.recommendationSummary.adoptionRate}%</div>
          <div className={styles.summaryLabel}>采纳率</div>
        </div>
      </section>

      <section className={styles.distributionGrid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>类型分布</div>
          {renderStats(data.typeDistribution)}
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>风格分布</div>
          {renderStats(compactStyleDistribution)}
        </div>
      </section>

      <section className={`${styles.card} ${styles.insightCard}`}>
        <div className={styles.insightCardHeader}>
          <div className={styles.cardTitle}>趋势与整理建议</div>
          <span className={styles.insightBadge}>本周重点</span>
        </div>
        <div className={styles.insightTrend}>
          <div className={styles.insightTrendText}>
            推荐采纳率仍偏低，说明现有推荐与衣橱结构匹配度一般。
          </div>
          <div className={styles.insightTrendValue}>{data.recommendationSummary.adoptionRate}%</div>
        </div>
        <div className={styles.trendList}>
          {viewModel.trendItems.map((item, index) => (
            <div key={item.key} className={styles.trendItem}>
              <span className={styles.trendLabel}>{item.label}</span>
              <div className={styles.trendTrack}>
                <div
                  className={`${styles.trendBar} ${index === 0 ? styles.trendBarPrimary : index === 1 ? styles.trendBarSecondary : styles.trendBarAccent}`}
                  style={{ width: `${Math.round(item.value * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className={styles.focusNote}>
          <span className={styles.focusNoteText}>{viewModel.focusNote.text}</span>
          <span className={styles.focusNoteBadge}>{viewModel.focusNote.badge}</span>
        </div>
      </section>
    </div>
  )
}
