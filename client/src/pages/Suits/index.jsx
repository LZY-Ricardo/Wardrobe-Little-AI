import React, { useCallback, useEffect, useMemo } from 'react'
import { Dialog } from 'react-vant'
import { Toast } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import axios from '@/api'
import { Loading, Empty, ErrorBanner } from '@/components/Feedback'
import { buildAutoSuitName, isGenericSuitName } from '@/utils/suitName'
import { useSuitStore } from '@/store'
import styles from './index.module.less'

const formatTime = (ts) => {
  if (!ts) return ''
  const date = new Date(Number(ts))
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

const coverOf = (suit) => {
  if (suit?.cover) return suit.cover
  const items = Array.isArray(suit?.items) ? suit.items : []
  const img = items.find((c) => c?.image)?.image
  return img || ''
}

const SuitCard = ({ suit, onDelete }) => {
  const img = coverOf(suit)
  const items = Array.isArray(suit?.items) ? suit.items.slice(0, 6) : []
  const previewNames = items
    .map((item) => item?.name || item?.type || '')
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ')
  const displayName = !suit.name || isGenericSuitName(suit.name)
    ? buildAutoSuitName(suit.scene || '', suit.create_time)
    : suit.name

  return (
    <div className={styles.card}>
      <div className={styles.cardCover}>
        {img ? <img src={img} alt={displayName} /> : <div className={styles.cardPlaceholder}>搭配</div>}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardHeaderRow}>
          <div className={styles.cardTitleText}>{displayName}</div>
          <button type="button" className={styles.cardDelete} onClick={() => onDelete(suit)}>
            删除
          </button>
        </div>
        <div className={styles.cardMetaRow}>
          <span className={styles.metaScene}>{suit.scene || '通用场景'}</span>
          <span className={styles.metaCount}>{suit.item_count || items.length} 件单品</span>
          <span className={styles.metaTime}>{formatTime(suit.create_time)}</span>
        </div>
        {previewNames ? <div className={styles.cardSubtitle}>{previewNames}</div> : null}
        <div className={styles.thumbRow}>
          {items.length ? (
            items.map((item, idx) => (
              <div className={styles.thumb} key={`${suit.suit_id}-${item.cloth_id || idx}`}>
                {item?.image ? (
                  <img src={item.image} alt={item.name || item.type || '单品'} />
                ) : (
                  <div className={styles.thumbPlaceholder} />
                )}
              </div>
            ))
          ) : (
            <div className={styles.cardEmpty}>单品信息缺失</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Suits({ embedded = false }) {
  const navigate = useNavigate()
  const { suits, status, error, fetchAllSuits, setSuits } = useSuitStore()

  const loading = status === 'loading'
  const hasData = useMemo(() => Array.isArray(suits) && suits.length > 0, [suits])

  const fetchSuits = useCallback(async (forceRefresh = false) => {
    try {
      await fetchAllSuits(forceRefresh)
    } catch (err) {
      console.warn('Failed to load suits', err)
    }
  }, [fetchAllSuits])

  useEffect(() => {
    void fetchSuits()
  }, [fetchSuits])

  const handleDelete = (suit) => {
    Dialog.confirm({
      message: '确定删除该套装吗？',
      onConfirm: async () => {
        try {
          await axios.delete(`/suits/${suit.suit_id}`)
          Toast.show({ content: '删除成功', duration: 1000 })
          setSuits((prev) => prev.filter((item) => item.suit_id !== suit.suit_id))
        } catch (err) {
          Toast.show({ content: '删除失败，请重试', duration: 1200 })
        }
      },
    })
  }

  const renderContent = () => {
    if (loading) return <Loading text="加载套装库..." />
    if (error) return <ErrorBanner message={error} onAction={fetchSuits} />
    if (!hasData) {
      return (
        <div className={styles.emptyWrap}>
          <Empty description="暂无套装，去生成或自定义一个吧" />
          <div className={styles.emptyActions}>
            <button type="button" onClick={() => navigate('/match?tab=recommend')}>
              去场景推荐
            </button>
            <button type="button" onClick={() => navigate('/suits/create')}>
              新建套装
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className={styles.cardList}>
        {suits.map((suit) => (
          <SuitCard key={suit.suit_id} suit={suit} onDelete={handleDelete} />
        ))}
      </div>
    )
  }

  return (
    <div className={styles.suits}>
      {embedded ? null : (
        <div className={styles.header}>
          <div className={styles.headerTitle}>搭配合集</div>
          <button
            type="button"
            className={styles.headerAction}
            onClick={() => navigate('/suits/create')}
          >
            新建套装
          </button>
        </div>
      )}
      <div className={styles.body}>
        {embedded ? (
          <div className={styles.inlineAction}>
            <button type="button" onClick={() => navigate('/suits/create')}>
              新建套装
            </button>
          </div>
        ) : null}
        {renderContent()}
      </div>
      {embedded ? null : (
        <button type="button" className={styles.fab} onClick={() => navigate('/suits/create')} aria-label="新建套装">
          +
        </button>
      )}
    </div>
  )
}
