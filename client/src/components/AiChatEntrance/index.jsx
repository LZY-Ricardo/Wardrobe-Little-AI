import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import SvgIcon from '@/components/SvgIcon'
import { useUiStore } from '@/store'
import styles from './index.module.less'

const HIDDEN_PATH_PREFIXES = ['/aichat']
const AUTO_COLLAPSE_MS = 5000

export default function AiChatEntrance() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const aiEntranceHidden = useUiStore((s) => s.aiEntranceHidden)
  const [isExpanded, setIsExpanded] = useState(false)
  const autoCollapseTimerRef = useRef(null)

  const isHidden = HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  useEffect(() => {
    return () => {
      if (autoCollapseTimerRef.current) window.clearTimeout(autoCollapseTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isExpanded) return

    if (autoCollapseTimerRef.current) window.clearTimeout(autoCollapseTimerRef.current)

    autoCollapseTimerRef.current = window.setTimeout(() => {
      setIsExpanded(false)
    }, AUTO_COLLAPSE_MS)

    return () => {
      if (autoCollapseTimerRef.current) window.clearTimeout(autoCollapseTimerRef.current)
      autoCollapseTimerRef.current = null
    }
  }, [isExpanded])

  useEffect(() => {
    if (!isHidden) return

    if (autoCollapseTimerRef.current) window.clearTimeout(autoCollapseTimerRef.current)
    autoCollapseTimerRef.current = null

    setIsExpanded(false)
  }, [isHidden])

  useEffect(() => {
    if (!aiEntranceHidden) return

    if (autoCollapseTimerRef.current) window.clearTimeout(autoCollapseTimerRef.current)
    autoCollapseTimerRef.current = null
    setIsExpanded(false)
  }, [aiEntranceHidden])

  if (isHidden || aiEntranceHidden) return null

  const handleClick = () => {
    if (!isExpanded) {
      setIsExpanded(true)
      return
    }

    if (autoCollapseTimerRef.current) window.clearTimeout(autoCollapseTimerRef.current)
    autoCollapseTimerRef.current = null
    navigate('/aichat')
  }

  return (
    <button
      type="button"
      className={`${styles['entrance']} ${isExpanded ? styles['entrance--expanded'] : ''}`}
      aria-label="打开 AI 助手"
      aria-expanded={isExpanded}
      onClick={handleClick}
    >
      <SvgIcon iconName="icon-zhinengkefu" className={styles['entrance-icon']} />
    </button>
  )
}
