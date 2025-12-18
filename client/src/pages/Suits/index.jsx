import React, { useEffect, useMemo, useState } from 'react'
import { Dialog } from 'react-vant'
import { Toast } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import axios from '@/api'
import { Loading, Empty, ErrorBanner } from '@/components/Feedback'
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
  return (
    <div className={styles.card}>
      <div className={styles.cardCover}>
        {img ? <img src={img} alt={suit.name} /> : <div className={styles.cardPlaceholder}>套装</div>}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>{suit.name || '未命名套装'}</div>
          <button
            type="button"
            className={styles.cardDelete}
            onClick={() => onDelete(suit)}
          >
            删除
          </button>
        </div>
        <div className={styles.cardMeta}>
          <span className={styles.metaScene}>{suit.scene || '通用场景'}</span>
          <span className={styles.metaCount}>{suit.item_count || items.length} 件单品</span>
          <span className={styles.metaTime}>{formatTime(suit.create_time)}</span>
        </div>
        <div className={styles.cardItems}>
          {items.length ? (
            items.map((item, idx) => (
              <div className={styles.itemChip} key={`${suit.suit_id}-${item.cloth_id || idx}`}>
                <span className={styles.itemName}>{item.name || item.type || '单品'}</span>
                <span className={styles.itemTags}>
                  {[item.type, item.color, item.style]
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(' · ')}
                </span>
              </div>
            ))
          ) : (
            <div className={styles.cardEmpty}>单品信息缺失，请去衣橱完善</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Suits() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [suits, setSuits] = useState([])

  const hasData = useMemo(() => Array.isArray(suits) && suits.length > 0, [suits])

  const fetchSuits = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await axios.get('/suits')
      setSuits(Array.isArray(res?.data) ? res.data : [])
    } catch (err) {
      setError(err?.msg || err?.message || '获取套装库失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchSuits()
  }, [])

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
            <button type="button" onClick={() => navigate('/recommend')}>
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
      <div className={styles.body}>{renderContent()}</div>
    </div>
  )
}

