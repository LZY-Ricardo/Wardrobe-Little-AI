import React, { useCallback, useEffect, useState } from 'react'
import axios from '@/api'
import { ErrorBanner, Loading, Empty } from '@/components/Feedback'
import styles from './index.module.less'

const renderStats = (items = [], emptyText = '暂无数据') => {
  if (!Array.isArray(items) || !items.length) {
    return <div className={styles.emptyText}>{emptyText}</div>
  }
  return (
    <div className={styles.list}>
      {items.map((item) => (
        <div key={item.label || item.date} className={styles.listItem}>
          <span>{item.label || item.date}</span>
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

  if (status === 'loading') return <Loading text="分析你的衣橱中..." />
  if (status === 'error') return <ErrorBanner message={error} onAction={loadData} />
  if (!data) return <Empty description="暂无分析数据" />

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.title}>衣橱分析</div>
        <div className={styles.subtitle}>从衣物结构、使用记录和推荐采纳情况观察你的穿搭习惯</div>
      </div>

      <div className={styles.summaryGrid}>
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
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>类型分布</div>
          {renderStats(data.typeDistribution)}
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>风格分布</div>
          {renderStats(data.styleDistribution)}
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>颜色分布</div>
          {renderStats(data.colorDistribution)}
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>高频场景</div>
          {renderStats(data.sceneDistribution)}
        </div>
        <div className={styles.cardWide}>
          <div className={styles.cardTitle}>穿搭趋势</div>
          {renderStats(data.outfitTrend, '记录更多穿搭后，这里会出现趋势')}
        </div>
      </div>
    </div>
  )
}
