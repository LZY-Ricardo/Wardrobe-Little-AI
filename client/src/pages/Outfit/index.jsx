import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Overlay, Dialog } from 'react-vant'
import { Toast } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import SvgIcon from '@/components/SvgIcon'
import white from '@/assets/white.jpg'
import styles from './index.module.less'
import axios from '@/api'
import useDebouncedValue from '@/utils/useDebouncedValue'
import { useClosetStore } from '@/store'
import { Loading, Empty, ErrorBanner } from '@/components/Feedback'

const FILTER_OPTIONS = {
  type: ['全部', '上衣', '下衣', '鞋子', '配饰'],
  color: ['全部', '白色', '黑色', '红色'],
  season: ['全部', '春季', '夏季', '秋季', '冬季'],
  style: ['全部', '休闲', '通勤', '运动'],
}

const PAGE_SIZE = 12

const generateRandomColor = () => {
  const colors = [
    { bg: '#FFE4E1', text: '#8B0000' },
    { bg: '#E6F3FF', text: '#0066CC' },
    { bg: '#F0FFF0', text: '#006400' },
    { bg: '#FFF8DC', text: '#B8860B' },
    { bg: '#F5F0FF', text: '#6A0DAD' },
    { bg: '#FFE4B5', text: '#FF8C00' },
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

export default function Outfit() {
  const navigate = useNavigate()
  const [selectedItem, setSelectedItem] = useState(null)
  const [visible, setVisible] = useState(false)
  const [itemColors, setItemColors] = useState({})
  const [searchKeyword, setSearchKeyword] = useState('')
  const debouncedSearch = useDebouncedValue(searchKeyword, 300)

  const {
    items,
    setItems,
    filters,
    setFilters,
    page,
    setPage,
    hasMore,
    setHasMore,
    status,
    setStatus,
    error,
    setError,
    reset,
  } = useClosetStore()

  const loadClothes = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const res = await axios.get('/clothes/all')
      const data = res?.data || []
      setItems(data)
      setStatus('success')
      setHasMore(data.length > PAGE_SIZE)
    } catch (err) {
      console.error('获取衣物失败', err)
      setStatus('error')
      setError('获取衣物列表失败，请重试')
    }
  }, [setError, setHasMore, setItems, setStatus])

  useEffect(() => {
    loadClothes()
    return () => reset()
  }, [loadClothes, reset])

  const filteredClothes = useMemo(() => {
    const list = items || []
    const byType = filters.type === '全部' ? list : list.filter((item) => item.type?.includes(filters.type))
    const byColor = filters.color === '全部' ? byType : byType.filter((item) => item.color?.includes(filters.color))
    const bySeason = filters.season === '全部' ? byColor : byColor.filter((item) => item.season?.includes(filters.season))
    const byStyle = filters.style === '全部' ? bySeason : bySeason.filter((item) => item.style?.includes(filters.style))
    if (!debouncedSearch.trim()) return byStyle
    const keyword = debouncedSearch.trim()
    return byStyle.filter((item) =>
      [item.name, item.type, item.color, item.season, item.style].some((field) => field?.includes(keyword))
    )
  }, [items, filters, debouncedSearch])

  const pagedList = useMemo(() => filteredClothes.slice(0, page * PAGE_SIZE), [filteredClothes, page])

  useEffect(() => {
    if (filteredClothes.length > 0) {
      const colors = {}
      filteredClothes.forEach((_, index) => {
        colors[index] = {
          name: generateRandomColor(),
          style: generateRandomColor(),
          season: generateRandomColor(),
        }
      })
      setItemColors(colors)
    }
    setHasMore(filteredClothes.length > page * PAGE_SIZE)
  }, [filteredClothes, page, setHasMore])

  const handleFilterClick = (filterType, value) => {
    setFilters({ [filterType]: value })
    setPage(1)
  }

  const handleLoadMore = () => {
    if (hasMore) {
      setPage(page + 1)
    }
  }

  const handleDelete = async () => {
    if (!selectedItem) return
    try {
      await axios.delete(`/clothes/${selectedItem.cloth_id}`)
      Toast.show({ icon: 'success', content: '删除成功', duration: 1000 })
      setVisible(false)
      const nextItems = items.filter((item) => item.cloth_id !== selectedItem.cloth_id)
      setItems(nextItems)
    } catch (err) {
      console.error('删除衣物失败', err)
      Toast.show({ icon: 'fail', content: '删除失败，请重试', duration: 1200 })
    }
  }

  const renderContent = () => {
    if (status === 'loading') return <Loading text="加载衣物中..." />
    if (status === 'error') return <ErrorBanner message={error} onAction={loadClothes} />
    if (pagedList.length === 0) return <Empty description="暂无符合条件的衣物" />

    return (
      <div className={styles.clothes}>
        {pagedList.map((item, index) => (
          <div
            key={`${item.cloth_id || index}`}
            className={styles['clothes-item']}
            onClick={() => {
              setSelectedItem(item)
              setVisible(true)
            }}
          >
            <div className={styles['clothes-img']}>
              <img src={item.image || white} alt={item.name} />
            </div>
            <div className={styles.label}>
              <div
                className={styles['label-item']}
                style={{
                  backgroundColor: itemColors[index]?.name?.bg || '#f5f5f5',
                  color: itemColors[index]?.name?.text || '#333',
                }}
              >
                {item.name}
              </div>
              <div
                className={styles['label-item']}
                style={{
                  backgroundColor: itemColors[index]?.style?.bg || '#f5f5f5',
                  color: itemColors[index]?.style?.text || '#333',
                }}
              >
                {item.style}
              </div>
              <div
                className={styles['label-item']}
                style={{
                  backgroundColor: itemColors[index]?.season?.bg || '#f5f5f5',
                  color: itemColors[index]?.season?.text || '#333',
                }}
              >
                {item.season}
              </div>
            </div>
          </div>
        ))}

        {hasMore ? (
          <button type="button" className={styles['load-more']} onClick={handleLoadMore}>
            加载更多
          </button>
        ) : (
          <div className={styles['no-more']}>没有更多了</div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.outfit}>
      <div className={styles.header}>
        <div className={styles['header-left']}>我的衣橱</div>
        <div className={styles['search-box']}>
          <input
            type="text"
            placeholder="搜索衣物..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className={styles['search-input']}
          />
        </div>
        <div className={styles['header-right']} onClick={() => navigate('/add')}>
          <SvgIcon iconName="icon-jiahao-copy" />
        </div>
      </div>

      <div className={styles.container}>
        <div className={styles.select}>
          <div className={styles['select-type']}>
            {FILTER_OPTIONS.type.map((type) => (
              <div
                key={type}
                className={`${styles['type-item']} ${type === filters.type ? styles['type-item-active'] : ''}`}
                onClick={() => handleFilterClick('type', type)}
              >
                {type}
              </div>
            ))}
          </div>
          <div className={styles['select-color']}>
            {FILTER_OPTIONS.color.map((color) => (
              <div
                key={color}
                className={`${styles['color-item']} ${color === filters.color ? styles['color-item-active'] : ''}`}
                onClick={() => handleFilterClick('color', color)}
              >
                {color}
              </div>
            ))}
          </div>
          <div className={styles['select-season']}>
            {FILTER_OPTIONS.season.map((season) => (
              <div
                key={season}
                className={`${styles['season-item']} ${season === filters.season ? styles['season-item-active'] : ''}`}
                onClick={() => handleFilterClick('season', season)}
              >
                {season}
              </div>
            ))}
          </div>
          <div className={styles['select-style']}>
            {FILTER_OPTIONS.style.map((style) => (
              <div
                key={style}
                className={`${styles['style-item']} ${style === filters.style ? styles['style-item-active'] : ''}`}
                onClick={() => handleFilterClick('style', style)}
              >
                {style}
              </div>
            ))}
          </div>
        </div>

        {renderContent()}
      </div>

      <Overlay
        visible={visible}
        onClick={() => setVisible(false)}
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0',
        }}
      >
        <div className={styles['overlay-content']} onClick={(e) => e.stopPropagation()}>
          {selectedItem ? (
            <>
              <div className={styles['detail-image']}>
                <img src={selectedItem.image || white} alt={selectedItem.name} />
              </div>
              <div className={styles['detail-info']}>
                <h3 className={styles['detail-title']}>{selectedItem.name}</h3>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>类型：</span>
                  <span className={styles['detail-value']}>{selectedItem.type || '未知'}</span>
                </div>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>颜色：</span>
                  <span className={styles['detail-value']}>{selectedItem.color || '未知'}</span>
                </div>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>适宜季节：</span>
                  <span className={styles['detail-value']}>{selectedItem.season || '未知'}</span>
                </div>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>风格：</span>
                  <span className={styles['detail-value']}>{selectedItem.style || '未知'}</span>
                </div>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>材质：</span>
                  <span className={styles['detail-value']}>{selectedItem.material || '未知'}</span>
                </div>
                <div className={styles['detail-row']}>
                  <span className={styles['detail-label']}>常用程度：</span>
                  <span className={styles['detail-value']}>
                    {selectedItem.favorite === 1 ? '常用' : '不常用'}
                  </span>
                </div>

                <div className={styles['delete-button-container']}>
                  <button
                    className={styles['delete-button']}
                    onClick={() =>
                      Dialog.confirm({
                        message: '确定删除该衣物吗？',
                        onConfirm: () => handleDelete(),
                      })
                    }
                  >
                    删除衣物
                  </button>
                  <button
                    className={styles['update-button']}
                    onClick={() => navigate('/update', { state: selectedItem })}
                  >
                    更新衣物
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </Overlay>
    </div>
  )
}