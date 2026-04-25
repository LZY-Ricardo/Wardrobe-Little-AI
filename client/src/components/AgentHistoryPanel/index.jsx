import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from 'antd-mobile'
import styles from './index.module.less'

const CURRENT_SECTION_TITLE_HEIGHT = 30
const GROUP_SECTION_TITLE_HEIGHT = 30
const CURRENT_CARD_HEIGHT = 148
const HISTORY_CARD_HEIGHT = 164
const SECTION_BLOCK_GAP = 16
const OVERSCAN_PX = 480
const VIRTUALIZE_THRESHOLD = 20

const looksCorrupted = (text = '') => /[�]|[ÃÅæçéêëîïôöùûüÿÐÑØ×]/.test(String(text))

const normalizeSessionText = (text = '', fallback = '未命名会话') => {
  const value = String(text || '').trim()
  if (!value) return fallback
  return looksCorrupted(value) ? fallback : value
}

const summarizePreviewText = (text = '', fallback = '聊天记录', maxLength = 56) => {
  const normalized = normalizeSessionText(text, fallback)
  const plainText = normalized
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plainText) return fallback
  return plainText.length > maxLength ? `${plainText.slice(0, maxLength).trim()}...` : plainText
}

const getHistoryGroupLabel = (value) => {
  if (!value) return '更早'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '更早'

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000))

  if (diffDays <= 0) return '今天'
  if (diffDays === 1) return '昨天'
  return '更早'
}

const formatDateBadge = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isToday) {
    return `今天 ${date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
  }

  return date.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  })
}

const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const renderHighlightedText = (text, keyword) => {
  const content = String(text || '')
  const needle = String(keyword || '').trim()
  if (!needle) return content

  const pattern = new RegExp(`(${escapeRegExp(needle)})`, 'ig')
  const parts = content.split(pattern)
  return parts.map((part, index) =>
    part.toLowerCase() === needle.toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : part,
  )
}

function HistorySessionCard({
  item,
  historyKeyword,
  isActive = false,
  isDanger = false,
  armedDeleteSessionId,
  onSelectSession,
  onDelete,
  onPressStart,
  onPressEnd,
}) {
  return (
    <button
      type="button"
      className={`${styles.sheetItem} ${isActive ? styles.sheetItemActive : ''} ${isDanger ? styles.sheetItemDanger : ''}`}
      onClick={() => onSelectSession?.(item)}
      onMouseDown={() => onPressStart?.(item.id)}
      onMouseUp={onPressEnd}
      onMouseLeave={onPressEnd}
      onTouchStart={() => onPressStart?.(item.id)}
      onTouchEnd={onPressEnd}
      onTouchCancel={onPressEnd}
    >
      <div className={styles.sheetItemHead}>
        <strong>{renderHighlightedText(normalizeSessionText(item.title, '未命名会话'), historyKeyword)}</strong>
        {armedDeleteSessionId === item.id && !isActive ? (
          <span
            className={styles.sheetDelete}
            role="button"
            tabIndex={0}
            onClick={(event) => void onDelete?.(item, event)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                void onDelete?.(item, event)
              }
            }}
          >
            删除
          </span>
        ) : null}
      </div>
      <span className={styles.sheetItemMeta}>{formatDateBadge(item.last_message_at)}</span>
      <span className={styles.sheetItemPreview}>
        {renderHighlightedText(
          summarizePreviewText(item.last_message_preview, normalizeSessionText(item.current_task_type, '聊天记录')),
          historyKeyword,
        )}
      </span>
    </button>
  )
}

export default function AgentHistoryPanel({
  sessionId,
  session,
  sessionList,
  loadSessionList,
  requestDeleteSession,
  onSelectSession,
  embedded = true,
  onClose,
  onExpandFull,
}) {
  const [historyKeyword, setHistoryKeyword] = useState('')
  const [historyRecentOnly, setHistoryRecentOnly] = useState(false)
  const [armedDeleteSessionId, setArmedDeleteSessionId] = useState(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const pressTimerRef = useRef(null)
  const handleTouchStateRef = useRef({ pressing: false, startY: 0, moved: false })
  const listRef = useRef(null)

  const currentHistorySessionResolved = useMemo(() => {
    if (session?.id) return session
    return sessionList.find((item) => item.id === sessionId) || null
  }, [session, sessionId, sessionList])

  const filteredHistorySessions = useMemo(() => {
    const keyword = historyKeyword.trim().toLowerCase()
    const now = Date.now()
    const last30Days = 30 * 24 * 60 * 60 * 1000

    return sessionList.filter((item) => {
      if (!item?.id) return false
      if (currentHistorySessionResolved?.id === item.id) return false

      if (historyRecentOnly) {
        const time = new Date(item.last_message_at || item.updated_at || item.created_at).getTime()
        if (Number.isNaN(time) || now - time > last30Days) return false
      }

      if (!keyword) return true

      const title = normalizeSessionText(item.title, '未命名会话').toLowerCase()
      const preview = summarizePreviewText(item.last_message_preview, item.current_task_type || '聊天记录').toLowerCase()
      return title.includes(keyword) || preview.includes(keyword)
    })
  }, [currentHistorySessionResolved?.id, historyKeyword, historyRecentOnly, sessionList])

  const groupedHistorySessions = useMemo(() => {
    const groups = new Map()

    filteredHistorySessions.forEach((item) => {
      const label = getHistoryGroupLabel(item.last_message_at || item.updated_at || item.created_at)
      const list = groups.get(label) || []
      list.push(item)
      groups.set(label, list)
    })

    return ['今天', '昨天', '更早']
      .filter((label) => groups.has(label))
      .map((label) => [label, groups.get(label)])
  }, [filteredHistorySessions])

  const flatEntries = useMemo(() => {
    const entries = []

    if (currentHistorySessionResolved?.id) {
      entries.push({
        key: 'current-title',
        type: 'section-title',
        label: '当前会话',
        height: CURRENT_SECTION_TITLE_HEIGHT,
      })
      entries.push({
        key: `current-item-${currentHistorySessionResolved.id}`,
        type: 'current-item',
        item: currentHistorySessionResolved,
        height: CURRENT_CARD_HEIGHT,
      })
      if (groupedHistorySessions.length) {
        entries.push({ key: 'current-gap', type: 'gap', height: SECTION_BLOCK_GAP })
      }
    }

    groupedHistorySessions.forEach(([groupLabel, list], groupIndex) => {
      entries.push({
        key: `group-title-${groupLabel}`,
        type: 'section-title',
        label: groupLabel,
        height: GROUP_SECTION_TITLE_HEIGHT,
      })

      list.forEach((item) => {
        entries.push({
          key: `history-item-${item.id}`,
          type: 'history-item',
          item,
          height: HISTORY_CARD_HEIGHT,
        })
      })

      if (groupIndex < groupedHistorySessions.length - 1) {
        entries.push({ key: `group-gap-${groupLabel}`, type: 'gap', height: SECTION_BLOCK_GAP })
      }
    })

    let offset = 0
    return entries.map((entry) => {
      const withOffset = { ...entry, offsetTop: offset }
      offset += entry.height
      return withOffset
    })
  }, [currentHistorySessionResolved, groupedHistorySessions])

  const totalHeight = flatEntries.length ? flatEntries[flatEntries.length - 1].offsetTop + flatEntries[flatEntries.length - 1].height : 0
  const shouldVirtualize = flatEntries.length >= VIRTUALIZE_THRESHOLD

  const visibleEntries = useMemo(() => {
    if (!shouldVirtualize) return flatEntries

    const start = Math.max(0, scrollTop - OVERSCAN_PX)
    const end = scrollTop + viewportHeight + OVERSCAN_PX

    return flatEntries.filter((entry) => entry.offsetTop + entry.height >= start && entry.offsetTop <= end)
  }, [flatEntries, scrollTop, shouldVirtualize, viewportHeight])

  useEffect(() => {
    const element = listRef.current
    if (!element) return undefined

    const updateViewportHeight = () => {
      setViewportHeight(element.clientHeight)
    }

    updateViewportHeight()

    const resizeObserver = new ResizeObserver(() => {
      updateViewportHeight()
    })

    resizeObserver.observe(element)
    window.addEventListener('resize', updateViewportHeight)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateViewportHeight)
    }
  }, [])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = 0
    setScrollTop(0)
  }, [historyKeyword, historyRecentOnly])

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

  const handlePressStart = (targetSessionId) => {
    clearPressTimer()
    pressTimerRef.current = window.setTimeout(() => {
      setArmedDeleteSessionId(targetSessionId)
    }, 420)
  }

  const handlePressEnd = () => {
    clearPressTimer()
  }

  const handleDeleteHistorySession = async (targetSession, event) => {
    event?.stopPropagation?.()
    event?.preventDefault?.()

    const confirmed = await Dialog.confirm({
      content: '确认删除这条历史会话？',
      confirmText: '删除',
      cancelText: '取消',
    })

    if (!confirmed) return

    const success = await requestDeleteSession?.(targetSession.id)
    if (!success) return

    setArmedDeleteSessionId(null)
    await loadSessionList?.()
  }

  const handleHandleTouchStart = (event) => {
    const touch = event.touches?.[0]
    handleTouchStateRef.current = {
      pressing: true,
      startY: touch?.clientY ?? 0,
      moved: false,
    }
  }

  const handleHandleTouchMove = (event) => {
    if (!handleTouchStateRef.current.pressing) return

    const touch = event.touches?.[0]
    const currentY = touch?.clientY ?? 0
    const deltaY = handleTouchStateRef.current.startY - currentY

    if (deltaY > 36) {
      handleTouchStateRef.current.moved = true
      handleTouchStateRef.current.pressing = false
      onExpandFull?.()
    }
  }

  const handleHandleTouchEnd = () => {
    if (!handleTouchStateRef.current.moved) {
      onClose?.()
    }

    handleTouchStateRef.current = {
      pressing: false,
      startY: 0,
      moved: false,
    }
  }

  const panelClassName = embedded ? styles.sheet : styles.pagePanel

  return (
    <div className={panelClassName}>
      {embedded ? (
        <>
          <div
            className={styles.sheetHandle}
            onClick={onClose}
            onTouchStart={handleHandleTouchStart}
            onTouchMove={handleHandleTouchMove}
            onTouchEnd={handleHandleTouchEnd}
          />

          <div className={styles.headerRow}>
            <div className={styles.sheetTitle}>历史会话</div>
            <button type="button" className={styles.fullLink} onClick={onExpandFull}>
              全屏查看
            </button>
          </div>
        </>
      ) : null}

      <div className={styles.sheetTools}>
        <input
          value={historyKeyword}
          onChange={(event) => setHistoryKeyword(event.target.value)}
          className={styles.sheetSearch}
          placeholder="搜索会话标题或内容"
        />
        <button
          type="button"
          className={`${styles.sheetFilter} ${historyRecentOnly ? styles.sheetFilterActive : ''}`}
          onClick={() => setHistoryRecentOnly((prev) => !prev)}
        >
          近 30 天
        </button>
      </div>

      <div
        ref={listRef}
        className={styles.sheetList}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return
          if (!armedDeleteSessionId) return
          setArmedDeleteSessionId(null)
        }}
      >
        {flatEntries.length ? (
          shouldVirtualize ? (
            <div className={styles.virtualCanvas} style={{ height: `${totalHeight}px` }}>
              {visibleEntries.map((entry) => {
                if (entry.type === 'gap') return null

                return (
                  <div
                    key={entry.key}
                    className={styles.virtualItem}
                    style={{ top: `${entry.offsetTop}px`, height: `${entry.height}px` }}
                  >
                    {entry.type === 'section-title' ? (
                      <div className={styles.sheetSectionTitle}>{entry.label}</div>
                    ) : (
                      <HistorySessionCard
                        item={entry.item}
                        historyKeyword={historyKeyword}
                        isActive={entry.type === 'current-item'}
                        isDanger={armedDeleteSessionId === entry.item.id}
                        armedDeleteSessionId={armedDeleteSessionId}
                        onSelectSession={onSelectSession}
                        onDelete={handleDeleteHistorySession}
                        onPressStart={handlePressStart}
                        onPressEnd={handlePressEnd}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className={styles.sheetSections}>
              {currentHistorySessionResolved?.id ? (
                <div className={styles.sheetSection}>
                  <div className={styles.sheetSectionTitle}>当前会话</div>
                  <HistorySessionCard
                    item={currentHistorySessionResolved}
                    historyKeyword={historyKeyword}
                    isActive
                    armedDeleteSessionId={armedDeleteSessionId}
                    onSelectSession={onSelectSession}
                    onDelete={handleDeleteHistorySession}
                    onPressStart={handlePressStart}
                    onPressEnd={handlePressEnd}
                  />
                </div>
              ) : null}

              {groupedHistorySessions.map(([groupLabel, list]) => (
                <div key={groupLabel} className={styles.sheetSection}>
                  <div className={styles.sheetSectionTitle}>{groupLabel}</div>
                  {list.map((item) => (
                    <HistorySessionCard
                      key={item.id}
                      item={item}
                      historyKeyword={historyKeyword}
                      isDanger={armedDeleteSessionId === item.id}
                      armedDeleteSessionId={armedDeleteSessionId}
                      onSelectSession={onSelectSession}
                      onDelete={handleDeleteHistorySession}
                      onPressStart={handlePressStart}
                      onPressEnd={handlePressEnd}
                    />
                  ))}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className={styles.sheetEmpty}>
            {historyKeyword ? '没有找到匹配的会话' : historyRecentOnly ? '近 30 天内暂无历史会话' : '还没有历史会话'}
          </div>
        )}
      </div>
    </div>
  )
}
