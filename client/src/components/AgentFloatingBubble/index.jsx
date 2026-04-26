import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAgentEntryStore } from '@/store'
import styles from './index.module.less'

const STORAGE_KEY = 'agent-floating-bubble-v1'
const COLLAPSED_DOUBLE_CLICK_DELAY = 220
const BUBBLE_WIDTH = 108
const BUBBLE_HEIGHT = 44
const COLLAPSED_WIDTH = 44
const EDGE_GAP = 8
const TOP_GAP = 96

const readStoredBubbleState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

const writeStoredBubbleState = (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // ignore
  }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const shouldHideBubbleOnPath = (pathname = '') =>
  pathname.startsWith('/unified-agent') ||
  pathname.startsWith('/aichat') ||
  pathname.startsWith('/agent/history') ||
  pathname.startsWith('/agent')

const createDefaultPosition = ({ collapsed = false, bottomInset = 0 } = {}) => ({
  side: 'right',
  y: Math.max(TOP_GAP, window.innerHeight - bottomInset - BUBBLE_HEIGHT - 24),
  collapsed,
})

export default function AgentFloatingBubble({ bottomInset = 0 }) {
  const navigate = useNavigate()
  const location = useLocation()
  const currentEntry = useAgentEntryStore((s) => s.currentEntry)
  const bubbleRef = useRef(null)
  const collapsedClickTimerRef = useRef(null)
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: null,
    offsetX: 0,
    offsetY: 0,
    width: BUBBLE_WIDTH,
  })
  const [mounted, setMounted] = useState(false)
  const [position, setPosition] = useState(() => ({
    side: 'right',
    y: 520,
    collapsed: false,
  }))

  const hidden = shouldHideBubbleOnPath(location.pathname)

  useEffect(() => {
    const stored = readStoredBubbleState()
    const next = stored && typeof stored.y === 'number'
      ? stored
      : createDefaultPosition({ collapsed: false, bottomInset })
    setPosition({
      side: stored?.side === 'left' ? 'left' : 'right',
      y: next.y,
      collapsed: Boolean(stored?.collapsed),
    })
    setMounted(true)
  }, [bottomInset])

  useEffect(() => {
    if (!mounted) return
    writeStoredBubbleState(position)
  }, [mounted, position])

  useEffect(() => () => {
    if (collapsedClickTimerRef.current) {
      window.clearTimeout(collapsedClickTimerRef.current)
      collapsedClickTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mounted) return undefined
    const handleResize = () => {
      const maxY = Math.max(TOP_GAP, window.innerHeight - bottomInset - BUBBLE_HEIGHT - EDGE_GAP)
      setPosition((prev) => ({
        ...prev,
        y: clamp(prev.y, TOP_GAP, maxY),
      }))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [bottomInset, mounted])

  const label = useMemo(() => (position.collapsed ? '' : 'Agent'), [position.collapsed])
  const width = position.collapsed ? COLLAPSED_WIDTH : BUBBLE_WIDTH

  const startDrag = (event) => {
    if (!bubbleRef.current) return
    const rect = bubbleRef.current.getBoundingClientRect()
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
    }
    bubbleRef.current.setPointerCapture?.(event.pointerId)
  }

  const moveDrag = (event) => {
    if (!dragRef.current.active) return
    const maxY = Math.max(TOP_GAP, window.innerHeight - bottomInset - BUBBLE_HEIGHT - EDGE_GAP)
    const nextY = clamp(event.clientY - dragRef.current.offsetY, TOP_GAP, maxY)
    const nextX = event.clientX - dragRef.current.offsetX
    const threshold = window.innerWidth / 2 - dragRef.current.width / 2
    dragRef.current.moved = true
    setPosition((prev) => ({
      ...prev,
      side: nextX <= threshold ? 'left' : 'right',
      y: nextY,
    }))
  }

  const endDrag = () => {
    dragRef.current.active = false
    window.setTimeout(() => {
      dragRef.current.moved = false
    }, 0)
  }

  const handleOpen = () => {
    if (dragRef.current.moved) return
    if (currentEntry?.presetTask) {
      navigate('/unified-agent', {
        state: {
          presetTask: currentEntry.presetTask,
          ...(currentEntry.state || {}),
        },
      })
      return
    }
    navigate('/unified-agent')
  }

  const toggleCollapsed = (event) => {
    event.stopPropagation()
    setPosition((prev) => ({
      ...prev,
      collapsed: !prev.collapsed,
    }))
  }

  const handleBubbleClick = () => {
    if (dragRef.current.moved) return

    if (!position.collapsed) {
      handleOpen()
      return
    }

    if (collapsedClickTimerRef.current) {
      window.clearTimeout(collapsedClickTimerRef.current)
      collapsedClickTimerRef.current = null
      handleOpen()
      return
    }

    collapsedClickTimerRef.current = window.setTimeout(() => {
      collapsedClickTimerRef.current = null
      setPosition((prev) => ({
        ...prev,
        collapsed: false,
      }))
    }, COLLAPSED_DOUBLE_CLICK_DELAY)
  }

  if (!mounted || hidden) return null

  return (
    <div
      ref={bubbleRef}
      className={`${styles.bubble} ${position.side === 'left' ? styles.left : styles.right} ${position.collapsed ? styles.collapsed : ''}`}
      style={{ top: `${position.y}px`, width: `${width}px` }}
      onClick={handleBubbleClick}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="button"
      tabIndex={0}
      aria-label="打开 Agent"
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleBubbleClick()
        }
      }}
    >
      <span className={styles.iconWrap} aria-hidden="true">
        <span className={styles.iconCore} />
      </span>
      {label ? <span className={styles.label}>{label}</span> : null}
      {position.collapsed ? null : (
        <button
          type="button"
          className={styles.toggle}
          onClick={toggleCollapsed}
          aria-label="收起 Agent 气泡"
        >
          ‹
        </button>
      )}
    </div>
  )
}
