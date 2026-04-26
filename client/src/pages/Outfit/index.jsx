import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from 'react-vant'
import { Toast } from 'antd-mobile'
import { HeartFill, HeartOutline, FilterOutline, SearchOutline } from 'antd-mobile-icons'
import { useLocation, useNavigate } from 'react-router-dom'
import white from '@/assets/white.jpg'
import styles from './index.module.less'
import axios from '@/api'
import { buildAgentContextState, createFocusReader } from '@/utils/agentContext'
import useDebouncedValue from '@/utils/useDebouncedValue'
import { getTodayInChina } from '@/utils/date'
import { resolveReturnObject } from '@/utils/returnNavigation'
import { useClosetStore, useMatchStore } from '@/store'
import { Loading, Empty, ErrorBanner } from '@/components/Feedback'
import { buildOutfitViewModel } from './viewModel'

const FILTER_OPTIONS = {
  type: ['全部', '上衣', '下衣', '鞋子', '配饰'],
  color: ['全部', '白色', '黑色', '红色'],
  season: ['全部', '春季', '夏季', '秋季', '冬季'],
  style: ['全部', '休闲', '通勤', '运动'],
}

const PAGE_SIZE = 12
const DETAIL_SHEET_DIALOG_Z_INDEX = 7101

const isFavorited = (value) => value === 1 || value === true || value === '1' || value === 'true'

export default function Outfit() {
  const navigate = useNavigate()
  const location = useLocation()
  const [selectedItem, setSelectedItem] = useState(null)
  const [visible, setVisible] = useState(false)
  const [sheetMounted, setSheetMounted] = useState(false)
  const [sheetActive, setSheetActive] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const debouncedSearch = useDebouncedValue(searchKeyword, 300)
  const [favoriteUpdating, setFavoriteUpdating] = useState({})
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
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
    fetchAllClothes,
  } = useClosetStore()
  const markMatchStale = useMatchStore((s) => s.markStale)

  const loadClothes = useCallback(async (forceRefresh = false) => {
    setStatus('loading')
    setError('')
    try {
      const data = await fetchAllClothes(forceRefresh)
      const validData = Array.isArray(data) ? data : []
      setItems(validData)
      setStatus('success')
      setHasMore(validData.length > PAGE_SIZE)
    } catch (err) {
      console.error('获取衣物失败', err)
      setStatus('error')
      setError('获取衣物列表失败，请重试')
      setItems([])
    }
  }, [fetchAllClothes, setError, setHasMore, setItems, setStatus])

  useEffect(() => {
    void loadClothes()
    return () => reset()
  }, [loadClothes, reset])

  useEffect(() => {
    const cloth = resolveReturnObject(location.state, [
      createFocusReader('cloth'),
      (state) => state.selectedCloth,
    ])
    if (!cloth?.cloth_id) return
    setSelectedItem(cloth)
    setVisible(true)
  }, [location.state])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const { body } = document
    const previousOverflow = body.style.overflow

    if (sheetMounted) {
      body.style.overflow = 'hidden'
    }

    return () => {
      body.style.overflow = previousOverflow
    }
  }, [sheetMounted])

  useEffect(() => {
    if (!visible) {
      setSheetActive(false)
      if (!sheetMounted) return undefined

      const closeTimer = window.setTimeout(() => {
        setSheetMounted(false)
      }, 220)

      return () => window.clearTimeout(closeTimer)
    }

    setSheetMounted(true)
    const frameId = window.requestAnimationFrame(() => {
      setSheetActive(true)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [visible, sheetMounted])

  const closeDetailSheet = useCallback(() => {
    setVisible(false)
  }, [])

  const filteredClothes = useMemo(() => {
    const list = Array.isArray(items) ? items : []
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

  const viewModel = useMemo(
    () =>
      buildOutfitViewModel({
        items,
        filters,
      }),
    [items, filters]
  )

  const selectedCardModel = useMemo(
    () => (selectedItem ? viewModel.buildCardModel(selectedItem) : null),
    [selectedItem, viewModel]
  )

  const handleFilterClick = (filterType, value) => {
    setFilters({ [filterType]: value })
    setPage(1)
  }

  const handleResetSecondaryFilters = () => {
    setFilters({ color: '全部', season: '全部', style: '全部' })
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
    if (!file || backupBusy) return
    setBackupBusy(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const rawItems = Array.isArray(parsed) ? parsed : parsed?.data?.items || parsed?.items || []
      const nextItems = Array.isArray(rawItems) ? rawItems : []
      if (!nextItems.length) {
        Toast.show({ content: '导入文件为空或格式不正确', duration: 1500 })
        return
      }
      await axios.post('/clothes/import', { items: nextItems })
      Toast.show({ content: '导入完成', duration: 1200 })
      await loadClothes()
      markMatchStale()
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
      setSelectedItem(null)
      const nextItems = items.filter((item) => item.cloth_id !== selectedItem.cloth_id)
      setItems(nextItems)
      markMatchStale()
      useClosetStore.getState().invalidateCache()
    } catch (err) {
      console.error('删除衣物失败', err)
      Toast.show({ icon: 'fail', content: '删除失败，请重试', duration: 1200 })
    }
  }

  const handleCreateOutfitLog = async (cloth) => {
    const clothId = cloth?.cloth_id
    if (!clothId) return
    try {
      await axios.post('/outfit-logs', {
        logDate: getTodayInChina(),
        scene: '日常',
        source: 'closet',
        note: cloth?.name ? `从衣橱记录：${cloth.name}` : '从衣橱记录',
        items: [clothId],
      })
      Toast.show({ icon: 'success', content: '已加入穿搭记录', duration: 1000 })
      setVisible(false)
    } catch (err) {
      console.error('加入穿搭记录失败', err)
      Toast.show({ icon: 'fail', content: err?.msg || '加入失败，请重试', duration: 1200 })
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
    if (!clothId || favoriteUpdating[clothId]) return

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
      <div className={styles.clothesWrap}>
        <div className={styles.clothesGrid}>
          {pagedList.map((item, index) => {
            const cardModel = viewModel.buildCardModel(item)

            return (
              <article
                key={`${item.cloth_id || index}`}
                className={styles.clothesItem}
                onClick={() => {
                  setSelectedItem(item)
                  setVisible(true)
                }}
              >
                <button
                  type="button"
                  className={styles.favoriteBtn}
                  disabled={Boolean(favoriteUpdating[item.cloth_id])}
                  aria-label={cardModel.isFavorited ? '取消收藏' : '收藏'}
                  onClick={(e) => {
                    e.stopPropagation()
                    void toggleFavorite(item)
                  }}
                >
                  {cardModel.isFavorited ? (
                    <HeartFill className={`${styles.favoriteIcon} ${styles.favoriteIconActive}`} />
                  ) : (
                    <HeartOutline className={styles.favoriteIcon} />
                  )}
                </button>

                <div className={styles.clothesImageWrap}>
                  <img src={item.image || white} alt={item.name} loading="lazy" className={styles.clothesImage} />
                </div>

                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle} title={cardModel.title}>
                    {cardModel.title}
                  </h3>
                  <div className={styles.cardMeta}>{cardModel.meta}</div>
                  <div className={styles.cardTags}>
                    {cardModel.tags.map((tag, tagIndex) => (
                      <span key={`${tag}-${tagIndex}`} className={styles.cardTag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        {hasMore ? (
          <button type="button" className={styles.loadMore} onClick={handleLoadMore}>
            加载更多
          </button>
        ) : (
          <div className={styles.noMore}>没有更多了</div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.outfit}>
      <div className={styles.header}>
        <div className={styles.hero}>
          <div className={styles.heroRow}>
            <div>
              <div className={styles.pageTitle}>我的衣橱</div>
              <div className={styles.pageMeta}>{viewModel.heroMeta}</div>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-label="更多操作"
              >
                ⋯
              </button>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.primaryIconButton}`}
                onClick={() => navigate('/add')}
                aria-label="新增衣物"
              >
                <span className={styles.addGlyph}>+</span>
              </button>
            </div>
          </div>

          <label className={styles.searchBox}>
            <SearchOutline className={styles.searchIcon} />
            <input
              type="text"
              placeholder="搜索名称、颜色、风格"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className={styles.searchInput}
            />
          </label>

          <div className={styles.filterSection}>
            <div className={styles.typeRow}>
              <div className={styles.typeScroller}>
                {FILTER_OPTIONS.type.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`${styles.filterChip} ${type === filters.type ? styles.filterChipActive : ''}`}
                    onClick={() => handleFilterClick('type', type)}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={`${styles.filterToggle} ${filtersExpanded ? styles.filterToggleActive : ''}`}
                aria-label="高级筛选"
                onClick={() => setFiltersExpanded((prev) => !prev)}
              >
                <FilterOutline />
              </button>
            </div>

            {!filtersExpanded ? (
              <button type="button" className={styles.compactAdvancedBar} onClick={() => setFiltersExpanded(true)}>
                <div className={styles.compactAdvancedMain}>
                  <FilterOutline className={styles.compactAdvancedIcon} />
                  <span className={styles.compactAdvancedLabel}>高级筛选</span>
                </div>
                <div className={styles.compactAdvancedMeta}>
                  {viewModel.activeSecondaryFilters.length ? (
                    viewModel.activeSecondaryFilters.map((item) => (
                      <span key={item.key} className={styles.summaryTag}>
                        {item.value}
                      </span>
                    ))
                  ) : (
                    <span className={styles.summaryText}>颜色、季节、场景</span>
                  )}
                </div>
              </button>
            ) : (
              <div className={styles.expandedFilters}>
                <div className={styles.filterGroup}>
                  <div className={styles.filterGroupLabel}>颜色</div>
                  <div className={styles.filterOptions}>
                    {FILTER_OPTIONS.color.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`${styles.secondaryChip} ${color === filters.color ? styles.secondaryChipActive : ''}`}
                        onClick={() => handleFilterClick('color', color)}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.filterGroup}>
                  <div className={styles.filterGroupLabel}>季节</div>
                  <div className={styles.filterOptions}>
                    {FILTER_OPTIONS.season.map((season) => (
                      <button
                        key={season}
                        type="button"
                        className={`${styles.secondaryChip} ${
                          season === filters.season ? styles.secondaryChipActive : ''
                        }`}
                        onClick={() => handleFilterClick('season', season)}
                      >
                        {season}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.filterGroup}>
                  <div className={styles.filterGroupLabel}>场景</div>
                  <div className={styles.filterOptions}>
                    {FILTER_OPTIONS.style.map((style) => (
                      <button
                        key={style}
                        type="button"
                        className={`${styles.secondaryChip} ${style === filters.style ? styles.secondaryChipActive : ''}`}
                        onClick={() => handleFilterClick('style', style)}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.filterActions}>
                  <button type="button" className={styles.ghostAction} onClick={handleResetSecondaryFilters}>
                    重置
                  </button>
                  <button type="button" className={styles.primaryAction} onClick={() => setFiltersExpanded(false)}>
                    应用筛选
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {menuOpen ? (
          <>
            <div className={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
            <div className={styles.headerMenu}>
              <button
                type="button"
                className={styles.headerMenuItem}
                disabled={backupBusy}
                onClick={() => {
                  setMenuOpen(false)
                  void handleExport(false)
                }}
              >
                导出数据
              </button>
              <button
                type="button"
                className={styles.headerMenuItem}
                disabled={backupBusy}
                onClick={() => {
                  setMenuOpen(false)
                  Dialog.confirm({
                    message: '包含图片导出可能较大，且可能触发服务端大小限制，是否继续？',
                    onConfirm: () => handleExport(true),
                  })
                }}
              >
                含图导出
              </button>
              <button
                type="button"
                className={styles.headerMenuItem}
                disabled={backupBusy}
                onClick={() => {
                  setMenuOpen(false)
                  importInputRef.current?.click()
                }}
              >
                导入数据
              </button>
            </div>
          </>
        ) : null}

        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
      </div>

      <div className={styles.container}>{renderContent()}</div>

      {sheetMounted && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={`${styles.sheetOverlay} ${sheetActive ? styles.sheetOverlayActive : styles.sheetOverlayClosing}`}
              onClick={closeDetailSheet}
            >
              <div
                className={`${styles.sheet} ${sheetActive ? styles.sheetActive : styles.sheetClosing}`}
                onClick={(e) => e.stopPropagation()}
              >
                {selectedItem ? (
                  <>
                    <div className={styles.sheetHandle} />

                    <div className={styles.sheetHeader}>
                      <img
                        src={selectedItem.image || white}
                        alt={selectedItem.name}
                        loading="lazy"
                        className={styles.sheetImage}
                      />

                      <div className={styles.sheetIntro}>
                        <h3 className={styles.sheetTitle}>{selectedCardModel?.title || selectedItem.name}</h3>
                        <div className={styles.sheetMeta}>{selectedCardModel?.meta || selectedItem.type || '未分类'}</div>

                        <div className={styles.sheetTags}>
                          {selectedCardModel?.isFavorited ? <span className={styles.sheetBadgePrimary}>已收藏</span> : null}
                          {selectedItem.color ? <span className={styles.sheetBadge}>{selectedItem.color}</span> : null}
                          {selectedItem.season ? <span className={styles.sheetBadge}>{selectedItem.season}</span> : null}
                          {selectedItem.material ? <span className={styles.sheetBadge}>{selectedItem.material}</span> : null}
                        </div>
                      </div>
                    </div>

                    <div className={styles.sheetSummary}>
                      {[selectedItem.type, selectedItem.style, selectedItem.season].filter(Boolean).join(' · ') ||
                        '完善这件单品的信息后，推荐和记录会更准确。'}
                    </div>

                    <div className={styles.primaryActionRow}>
                      <button
                        type="button"
                        className={styles.sheetPrimaryButton}
                        onClick={() => void handleCreateOutfitLog(selectedItem)}
                      >
                        记录穿搭
                      </button>
                      <button
                        type="button"
                        className={styles.sheetSecondaryButton}
                        onClick={() =>
                          navigate('/unified-agent', {
                            state: buildAgentContextState({
                              presetTask: `帮我处理这件衣物：${selectedItem?.name || selectedItem?.type || '当前衣物'}`,
                              focus: {
                                type: 'cloth',
                                entity: selectedItem,
                              },
                            }),
                          })
                        }
                      >
                        交给 Agent
                      </button>
                    </div>

                    <div className={styles.secondaryActionRow}>
                      <button
                        type="button"
                        className={styles.sheetTertiaryButton}
                        disabled={Boolean(favoriteUpdating[selectedItem.cloth_id])}
                        onClick={() => void toggleFavorite(selectedItem)}
                      >
                        {isFavorited(selectedItem.favorite) ? '取消收藏' : '收藏'}
                      </button>
                      <button
                        type="button"
                        className={styles.sheetTertiaryButton}
                        onClick={() => navigate('/update', { state: selectedItem })}
                      >
                        编辑
                      </button>
                    </div>

                    <button
                      type="button"
                      className={styles.sheetDangerButton}
                      onClick={() =>
                        Dialog.confirm({
                          message: '确定删除该衣物吗？',
                          zIndex: DETAIL_SHEET_DIALOG_Z_INDEX,
                          onConfirm: () => handleDelete(),
                        })
                      }
                    >
                      删除
                    </button>
                  </>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
