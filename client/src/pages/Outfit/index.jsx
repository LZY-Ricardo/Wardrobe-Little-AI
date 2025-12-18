import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Overlay, Dialog } from 'react-vant'
import { Toast } from 'antd-mobile'
import { HeartFill, HeartOutline, FilterOutline } from 'antd-mobile-icons'
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

const isFavorited = (value) => value === 1 || value === true || value === '1' || value === 'true'

export default function Outfit() {
  const navigate = useNavigate()
  const [selectedItem, setSelectedItem] = useState(null)
  const [visible, setVisible] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const debouncedSearch = useDebouncedValue(searchKeyword, 300)
  const [favoriteUpdating, setFavoriteUpdating] = useState({})
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const importInputRef = React.useRef(null)

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

  const downloadJson = (payload, filename) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExport = async (includeImages) => {
    if (backupBusy) return
    setBackupBusy(true)
    try {
      const res = await axios.get('/clothes/export', {
        params: { includeImages: includeImages ? 1 : 0 },
      })
      const date = new Date().toISOString().slice(0, 10)
      const suffix = includeImages ? 'with-images' : 'no-images'
      downloadJson(res?.data ?? res, `closet-export-${suffix}-${date}.json`)
      Toast.show({ content: '已导出', duration: 1000 })
    } catch (err) {
      console.error('导出失败', err)
      Toast.show({ content: '导出失败，请重试', duration: 1500 })
    } finally {
      setBackupBusy(false)
    }
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (backupBusy) return
    setBackupBusy(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const rawItems = Array.isArray(parsed) ? parsed : parsed?.data?.items || parsed?.items || []
      const items = Array.isArray(rawItems) ? rawItems : []
      if (!items.length) {
        Toast.show({ content: '导入文件为空或格式不正确', duration: 1500 })
        return
      }
      await axios.post('/clothes/import', { items })
      Toast.show({ content: '导入完成', duration: 1200 })
      await loadClothes()
    } catch (err) {
      console.error('导入失败', err)
      Toast.show({ content: '导入失败，请检查文件内容', duration: 1800 })
    } finally {
      setBackupBusy(false)
      if (importInputRef.current) importInputRef.current.value = ''
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

  const updateFavoriteLocal = useCallback(
    (clothId, favorite) => {
      const nextFavorite = favorite ? 1 : 0
      const nextItems = (items || []).map((item) =>
        item.cloth_id === clothId ? { ...item, favorite: nextFavorite } : item
      )
      setItems(nextItems)
      setSelectedItem((prev) => (prev?.cloth_id === clothId ? { ...prev, favorite: nextFavorite } : prev))
    },
    [items, setItems]
  )

  const toggleFavorite = async (cloth) => {
    const clothId = cloth?.cloth_id
    if (!clothId) return
    if (favoriteUpdating[clothId]) return

    const prevFavorite = isFavorited(cloth.favorite)
    const nextFavorite = !prevFavorite

    setFavoriteUpdating((prev) => ({ ...prev, [clothId]: true }))
    updateFavoriteLocal(clothId, nextFavorite)

    try {
      await axios.put(`/clothes/${clothId}`, { favorite: nextFavorite ? 1 : 0 })
      Toast.show({ icon: 'success', content: nextFavorite ? '已收藏' : '已取消收藏', duration: 900 })
    } catch (err) {
      console.error('更新收藏状态失败', err)
      updateFavoriteLocal(clothId, prevFavorite)
      Toast.show({ icon: 'fail', content: '操作失败，请重试', duration: 1200 })
    } finally {
      setFavoriteUpdating((prev) => {
        const next = { ...prev }
        delete next[clothId]
        return next
      })
    }
  }

  const renderContent = () => {
    if (status === 'loading') return <Loading text="加载衣物中..." />
    if (status === 'error') return <ErrorBanner message={error} onAction={loadClothes} />
    if (pagedList.length === 0) return <Empty description="暂无符合条件的衣物" />

    return (
      <div className={styles['clothes-wrap']}>
        <div className={styles.clothes}>
          {pagedList.map((item, index) => {
            const tags = []
            if (item.type) tags.push(item.type)
            if (item.style) tags.push(item.style)
            if (item.season) tags.push(item.season)
            if (tags.length < 3 && item.color) tags.push(item.color)
            const displayTags = tags.filter(Boolean).slice(0, 3)

            return (
              <div
                key={`${item.cloth_id || index}`}
                className={styles['clothes-item']}
                onClick={() => {
                  setSelectedItem(item)
                  setVisible(true)
                }}
              >
                <button
                  type="button"
                  className={styles['favorite-btn']}
                  disabled={Boolean(favoriteUpdating[item.cloth_id])}
                  aria-label={isFavorited(item.favorite) ? '取消收藏' : '收藏'}
                  onClick={(e) => {
                    e.stopPropagation()
                    void toggleFavorite(item)
                  }}
                >
                  {isFavorited(item.favorite) ? (
                    <HeartFill className={`${styles['favorite-icon']} ${styles['favorite-icon-active']}`} />
                  ) : (
                    <HeartOutline className={styles['favorite-icon']} />
                  )}
                </button>
                <div className={styles['clothes-img']}>
                  <img src={item.image || white} alt={item.name} loading="lazy" />
                </div>
                <div className={styles.label}>
                  <div className={styles['label-title']} title={item.name || ''}>
                    {item.name || '未命名'}
                  </div>
                  <div className={styles['label-tags']}>
                    {displayTags.map((tag, tagIndex) => (
                      <span key={`${tag}-${tagIndex}`} className={styles['label-item']}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

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
        <div className={styles['header-actions']}>
          <button
            type="button"
            className={styles['header-action']}
            disabled={backupBusy}
            onClick={() => void handleExport(false)}
          >
            导出
          </button>
          <button
            type="button"
            className={styles['header-action']}
            disabled={backupBusy}
            onClick={() =>
              Dialog.confirm({
                message: '包含图片导出可能较大，且可能触发服务端大小限制，是否继续？',
                onConfirm: () => handleExport(true),
              })
            }
          >
            含图
          </button>
          <button
            type="button"
            className={styles['header-action']}
            disabled={backupBusy}
            onClick={() => importInputRef.current?.click()}
          >
            导入
          </button>
          <div className={styles['header-right']} onClick={() => navigate('/add')}>
            <SvgIcon iconName="icon-jiahao-copy" />
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>
      </div>

      <div className={styles.container}>
        <div className={styles.select}>
          <div className={styles['select-top']}>
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

            <button
              type="button"
              className={`${styles['filters-toggle']} ${
                filtersExpanded || filters.color !== '全部' || filters.season !== '全部' || filters.style !== '全部'
                  ? styles['filters-toggle-active']
                  : ''
              }`}
              aria-label="筛选"
              onClick={() => setFiltersExpanded((prev) => !prev)}
            >
              <FilterOutline className={styles['filters-toggle-icon']} />
              {filters.color !== '全部' || filters.season !== '全部' || filters.style !== '全部' ? (
                <span className={styles['filters-dot']} />
              ) : null}
            </button>
          </div>

          {filtersExpanded ? (
            <div className={styles['select-more']}>
              <div className={styles['select-row']}>
                <div className={styles['select-row-label']}>颜色</div>
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
              </div>

              <div className={styles['select-row']}>
                <div className={styles['select-row-label']}>季节</div>
                <div className={styles['select-season']}>
                  {FILTER_OPTIONS.season.map((season) => (
                    <div
                      key={season}
                      className={`${styles['season-item']} ${
                        season === filters.season ? styles['season-item-active'] : ''
                      }`}
                      onClick={() => handleFilterClick('season', season)}
                    >
                      {season}
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles['select-row']}>
                <div className={styles['select-row-label']}>场景</div>
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
            </div>
          ) : null}
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
                <img src={selectedItem.image || white} alt={selectedItem.name} loading="lazy" />
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
                  <span className={styles['detail-label']}>收藏：</span>
                  <span className={styles['detail-value']}>
                    {isFavorited(selectedItem.favorite) ? '已收藏' : '未收藏'}
                  </span>
                </div>

                <div className={styles['delete-button-container']}>
                  <button
                    type="button"
                    className={styles['favorite-button']}
                    disabled={Boolean(favoriteUpdating[selectedItem.cloth_id])}
                    onClick={() => void toggleFavorite(selectedItem)}
                  >
                    {isFavorited(selectedItem.favorite) ? '取消收藏' : '收藏'}
                  </button>
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
