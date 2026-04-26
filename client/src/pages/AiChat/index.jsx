import SvgIcon from '@/components/SvgIcon'
import styles from './index.module.less'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Popup, Toast } from 'antd-mobile'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import axios from '@/api'
import { blobToBase64, compressImage } from '@/utils/imageUtils'
import AgentHistoryPanel from '@/components/AgentHistoryPanel'
import ToolDetailSection from './ToolDetailSection'
import PendingConfirmationCard from './PendingConfirmationCard'
import useAgentStreamSession from './useAgentStreamSession'
import useAgentSessionManager from './useAgentSessionManager'
import { formatReasoningSummary } from './reasoningState'
import { isScrollNearBottom } from './scrollState'
import {
  resolveInitialLatestTask,
  resolveInitialPendingImages,
  shouldRestorePrefillInput,
} from './sessionState'
import {
  buildRecommendationAttachmentGroups,
  getDisplayMessageText,
  normalizeAgentMessages,
} from './viewModels'

const CHAT_IMAGE_MAX_SIZE = 1 * 1024 * 1024
const CHAT_IMAGE_COMPRESS = { quality: 0.82, maxWidth: 960, maxHeight: 960 }

const QUICK_PROMPTS = ['今日穿什么', '场景推荐', '项目使用帮助']

const looksCorrupted = (text = '') => /[�]|[ÃÅæçéêëîïôöùûüÿÐÑØ×]/.test(String(text))

const normalizeSessionText = (text = '', fallback = 'chat') => {
  const value = String(text || '').trim()
  if (!value) return fallback
  return looksCorrupted(value) ? fallback : value
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

export default function AiChat() {
  const navigate = useNavigate()
  const location = useLocation()
  const scrollRef = useRef(null)
  const autoScrollEnabledRef = useRef(true)
  const inputRef = useRef(null)
  const imagePickerRef = useRef(null)

  const sessionId = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return Number.parseInt(search.get('sessionId') || '', 10)
  }, [location.search])

  const hasSessionIdQuery = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return search.has('sessionId')
  }, [location.search])

  const prefillText = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return search.get('prefill') || ''
  }, [location.search])

  const shouldOpenHistoryFromQuery = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return search.get('history') === '1'
  }, [location.search])

  const fallbackSession = location.state?.session || null
  const initialLatestTask = useMemo(() => resolveInitialLatestTask(location.state), [location.state])
  const initialPendingImages = useMemo(() => resolveInitialPendingImages(location.state), [location.state])
  const [session, setSession] = useState(fallbackSession)
  const [sessionList, setSessionList] = useState([])
  const [messages, setMessages] = useState([])
  const [localMessages, setLocalMessages] = useState([])
  const [pendingImages, setPendingImages] = useState(initialPendingImages)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('loading')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [latestTask, setLatestTask] = useState(initialLatestTask)
  const [pendingConfirmation, setPendingConfirmation] = useState(null)
  const [historyVisible, setHistoryVisible] = useState(false)
  const [actionsVisible, setActionsVisible] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [expandedToolMessages, setExpandedToolMessages] = useState(new Set())
  const [expandedReasoning, setExpandedReasoning] = useState(new Set())
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const [selectedRecommendationSuitByMessage, setSelectedRecommendationSuitByMessage] = useState({})

  const displayedMessages = useMemo(
    () => normalizeAgentMessages([...messages, ...localMessages]),
    [messages, localMessages]
  )

  useEffect(() => {
    if (!shouldRestorePrefillInput({
      prefillText,
      status,
      input,
      displayedMessageCount: displayedMessages.length,
    })) return
    setInput(prefillText)
    inputRef.current?.focus()
  }, [displayedMessages.length, input, prefillText, status])

  useEffect(() => {
    autoScrollEnabledRef.current = true
    setShowJumpToLatest(false)
  }, [sessionId])

  const downloadAttachmentFile = (attachment) => {
    if (attachment?.dataUrl) {
      const link = document.createElement('a')
      link.href = attachment.dataUrl
      link.download = attachment.name || 'export.json'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      return
    }
    if (!attachment?.content) return
    const blob = new Blob([JSON.stringify(attachment.content, null, 2)], {
      type: attachment.mimeType || 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = attachment.name || 'export.json'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (!autoScrollEnabledRef.current) {
      if (displayedMessages.length) {
        setShowJumpToLatest(true)
      }
      return
    }

    setShowJumpToLatest(false)

    requestAnimationFrame(() => {
      if (!scrollRef.current) return
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }, [displayedMessages, status])

  const { sendMessage, stopStreaming } = useAgentStreamSession({
    sessionId,
    latestTask,
    fallbackSession,
    sending,
    navigate,
    setSession,
    setMessages,
    setLocalMessages,
    setInput,
    setSending,
    setPendingConfirmation,
    setLatestTask,
    setPendingImages,
    setExpandedReasoning,
    setExpandedToolMessages,
  })

  const {
    loadSessionList,
    confirmPendingAction,
    cancelPendingAction,
    openHistory,
    expandHistoryPage,
    openActions,
    createNewSession,
    selectHistorySession,
    renameSession,
    clearMessages,
    deleteSession,
  } = useAgentSessionManager({
    sessionId,
    hasSessionIdQuery,
    shouldOpenHistoryFromQuery,
    fallbackSession,
    initialLatestTask,
    session,
    renaming,
    sending,
    navigate,
    setSession,
    setSessionList,
    setMessages,
    setLocalMessages,
    setStatus,
    setError,
    setLatestTask,
    setPendingConfirmation,
    setHistoryVisible,
    setActionsVisible,
    setRenaming,
    setSending,
  })

  useEffect(() => {
    if (!historyVisible) return
    void loadSessionList()
  }, [historyVisible, loadSessionList])

  const handleSend = async (presetValue) => {
    autoScrollEnabledRef.current = true
    setShowJumpToLatest(false)
    await sendMessage({ content: String(presetValue ?? input).trim(), images: pendingImages, preserveInput: true })
  }

  const handleJumpToLatest = () => {
    autoScrollEnabledRef.current = true
    setShowJumpToLatest(false)
    requestAnimationFrame(() => {
      if (!scrollRef.current) return
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    })
  }

  const handleActionButtonClick = (message) => {
    const actionButton = message?.actionButton
    if (!actionButton?.to) return
    navigate(actionButton.to, actionButton.state ? { state: actionButton.state } : undefined)
  }

  const handleConfirm = async () => {
    await confirmPendingAction(pendingConfirmation?.confirmId)
  }

  const handleCancel = async () => {
    await cancelPendingAction(pendingConfirmation?.confirmId)
  }

  const handleFillPrompt = (text) => {
    setActionsVisible(false)
    setInput(text)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const handleOpenAlbum = () => {
    setActionsVisible(false)
    imagePickerRef.current?.click()
  }

  const MAX_PENDING_IMAGES = 4

  const handlePickImage = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    const remaining = MAX_PENDING_IMAGES - pendingImages.length
    if (remaining <= 0) {
      Toast.show({ icon: 'fail', content: `最多支持 ${MAX_PENDING_IMAGES} 张图片`, duration: 1200 })
      return
    }

    const toProcess = files.slice(0, remaining)
    const newImages = []

    for (const file of toProcess) {
      if (!file.type.startsWith('image/')) {
        Toast.show({ icon: 'fail', content: '请选择图片文件', duration: 1200 })
        continue
      }

      try {
        const compressedBlob = await compressImage(
          file,
          CHAT_IMAGE_COMPRESS.quality,
          CHAT_IMAGE_COMPRESS.maxWidth,
          CHAT_IMAGE_COMPRESS.maxHeight,
        )
        if (compressedBlob.size > CHAT_IMAGE_MAX_SIZE) {
          Toast.show({ icon: 'fail', content: `${file.name} 过大，请换一张更小的图片`, duration: 1200 })
          continue
        }

        const dataUrl = await blobToBase64(compressedBlob)
        newImages.push({
          type: 'image',
          mimeType: compressedBlob.type || file.type || 'image/jpeg',
          name: file.name || 'selected-image',
          dataUrl,
        })
      } catch (pickError) {
        console.error('读取相册图片失败:', pickError)
        Toast.show({ icon: 'fail', content: '图片读取失败', duration: 1200 })
      }
    }

    if (newImages.length) {
      setPendingImages((prev) => [...prev, ...newImages])
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const handleRemovePendingImage = (index) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRenameSession = async () => {
    await renameSession(normalizeSessionText(session?.title, '新对话'))
  }

  const showEmptyState = status === 'success' && displayedMessages.length === 0
  const sessionTitle = normalizeSessionText(session?.title, '新对话')

  return (
    <div className={styles.chat}>
      <div className={styles.heroBg} />

      <header className={styles.chatHeader}>
        <button type="button" className={styles.iconButton} onClick={() => navigate('/unified-agent')}>
          ‹
        </button>
        <div className={styles.headerMain}>
          <div className={styles.headerAvatar}>
            <svg viewBox="0 0 60 60" fill="none" width="100%" height="100%">
              <rect width="60" height="60" rx="30" fill="#1a1a2e" />
              <polygon points="30,12 44,36 16,36" fill="none" stroke="#a855f7" strokeWidth="2.5" opacity="0.9" />
              <polygon points="30,48 16,24 44,24" fill="none" stroke="#7c3aed" strokeWidth="2.5" opacity="0.9" />
              <circle cx="30" cy="30" r="8" fill="none" stroke="#c084fc" strokeWidth="2" opacity="0.8" />
              <circle cx="30" cy="30" r="3" fill="#a855f7" />
              <circle cx="22" cy="18" r="1.5" fill="#c084fc" opacity="0.6" />
              <circle cx="38" cy="42" r="1.5" fill="#7c3aed" opacity="0.6" />
            </svg>
          </div>
          <div>
            <div className={styles.headerTitle}>{sessionTitle}</div>
          </div>
        </div>
        <button type="button" className={styles.iconButton} onClick={openHistory} aria-label="打开历史会话">
          <span className={styles.historyIcon} aria-hidden="true" />
        </button>
      </header>

      <div
        className={styles.chatBody}
        ref={scrollRef}
        onScroll={(event) => {
          const nearBottom = isScrollNearBottom(event.currentTarget)
          autoScrollEnabledRef.current = nearBottom
          if (nearBottom) {
            setShowJumpToLatest(false)
          }
        }}
      >
        {status === 'loading' ? <div className={styles.stateText}>加载会话中...</div> : null}
        {status === 'error' ? <div className={styles.stateText}>{error}</div> : null}

        {status === 'success' ? (
          <>
            {displayedMessages[0]?.id ? <div className={styles.dateBadge}>{formatDateBadge(session?.last_message_at)}</div> : null}

            {showEmptyState ? (
              <div className={styles.emptyBlock}>
                <div className={styles.emptyTitle}>今天想一起完成什么？</div>
                <div className={styles.quickPromptList}>
                  {QUICK_PROMPTS.map((item) => (
                    <button key={item} type="button" className={styles.quickPrompt} onClick={() => handleSend(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {displayedMessages.map((message) => (
              <div
                key={message.id}
                className={`${styles.messageRow} ${message.role === 'user' ? styles.fromUser : styles.fromAssistant}`}
              >
                {(() => {
                  const displayText = getDisplayMessageText(message)
                  const hasReasoning = message.role === 'assistant' && Boolean(message.reasoningContent)
                  const isReasoningStreaming = message.deliveryStatus === 'streaming' && !message.content
                  const reasoningExpanded = hasReasoning && (expandedReasoning.has(message.id) || isReasoningStreaming)
                  const assistantStatusText = message.role === 'assistant'
                    ? (message.deliveryStatus === 'failed' ? '回复生成失败' : message.deliveryStatus === 'cancelled' ? '已停止生成' : '')
                    : ''

                  return (
                    <div className={message.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                  {(() => {
                    const messageAttachments = Array.isArray(message.attachments) ? message.attachments : []
                    const fileAttachments = messageAttachments.filter((a) => a?.type === 'file' && (a?.dataUrl || a?.content))
                    const recommendationGroups = buildRecommendationAttachmentGroups(messageAttachments)
                    const defaultSuitIndex = recommendationGroups[0]?.suitIndex ?? 0
                    const selectedSuitIndex = recommendationGroups.length
                      ? (selectedRecommendationSuitByMessage[message.id] ?? defaultSuitIndex)
                      : defaultSuitIndex
                    const selectedRecommendationGroup = recommendationGroups.find((group) => group.suitIndex === selectedSuitIndex) || recommendationGroups[0] || null
                    const visibleAttachments = recommendationGroups.length
                      ? (selectedRecommendationGroup?.attachments || [])
                      : messageAttachments.filter((a) => a?.dataUrl)

                    return (
                      <>
                  {message.role === 'assistant' ? (
                    <div className={styles.messageLabel}>
                      <svg viewBox="0 0 60 60" fill="none" className={styles.labelAvatar}>
                        <rect width="60" height="60" rx="30" fill="#1a1a2e" />
                        <polygon points="30,12 44,36 16,36" fill="none" stroke="#a855f7" strokeWidth="2.5" opacity="0.9" />
                        <polygon points="30,48 16,24 44,24" fill="none" stroke="#7c3aed" strokeWidth="2.5" opacity="0.9" />
                        <circle cx="30" cy="30" r="8" fill="none" stroke="#c084fc" strokeWidth="2" opacity="0.8" />
                        <circle cx="30" cy="30" r="3" fill="#a855f7" />
                      </svg>
                      Agent
                    </div>
                  ) : null}
                  {recommendationGroups.length > 1 ? (
                    <div className={styles.recommendationTabs} role="tablist" aria-label="推荐套数切换">
                      {recommendationGroups.map((group) => (
                        <button
                          key={`${message.id}-suit-${group.suitIndex}`}
                          type="button"
                          className={`${styles.recommendationTab} ${group.suitIndex === selectedSuitIndex ? styles.recommendationTabActive : ''}`}
                          onClick={() => setSelectedRecommendationSuitByMessage((prev) => ({
                            ...prev,
                            [message.id]: group.suitIndex,
                          }))}
                        >
                          {group.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {visibleAttachments.length ? (
                    <div className={styles.messageImagesGrid} data-count={visibleAttachments.length}>
                      {visibleAttachments.map((attachment, index) => (
                        <img key={`${message.id}-img-${index}`} src={attachment.dataUrl} alt={attachment.name || '图片消息'} className={styles.messageImage} />
                      ))}
                    </div>
                  ) : null}
                  {fileAttachments.length ? (
                    <div className={styles.messageFiles}>
                      {fileAttachments.map((attachment, index) => (
                        <button
                          key={`${message.id}-file-${index}`}
                          type="button"
                          className={styles.messageFileButton}
                          onClick={() => downloadAttachmentFile(attachment)}
                        >
                          下载 {attachment.name || '导出文件'}
                        </button>
                      ))}
                    </div>
                  ) : null}
                      </>
                    )
                  })()}
                  {hasReasoning ? (
                    <div className={styles.reasoningBlock}>
                      <button
                        type="button"
                        className={styles.reasoningToggleBtn}
                        onClick={() => {
                          if (isReasoningStreaming) return
                          setExpandedReasoning((prev) => {
                            const next = new Set(prev)
                            if (next.has(message.id)) next.delete(message.id)
                            else next.add(message.id)
                            return next
                          })
                        }}
                      >
                        {reasoningExpanded ? '收起思考过程 ▴' : `${formatReasoningSummary(message)} ▾`}
                      </button>
                      <div className={reasoningExpanded ? styles.reasoningExpanded : styles.reasoningCollapsed}>
                        <div
                          className={`${styles.reasoningContent} ${isReasoningStreaming ? styles.streamingCursor : ''}`}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.reasoningContent}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {hasReasoning && message.toolPhase ? <div className={styles.toolPhaseText}>{message.toolPhase}</div> : null}
                  <div
                    className={`${styles.messageText} ${styles.markdownContent} ${message.deliveryStatus === 'streaming' && message.content ? styles.streamingCursor : ''}`}
                  >
                    {message.deliveryStatus === 'streaming' && !displayText && !hasReasoning ? (
                      <div className={styles.streamingState}>
                        {message.toolPhase ? <div className={styles.toolPhaseText}>{message.toolPhase}</div> : null}
                        <div className={styles.typingIndicator}>
                          <span /><span /><span />
                        </div>
                      </div>
                    ) : displayText ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown> : message.deliveryStatus === 'failed' ? '回复生成失败，请重试' : message.deliveryStatus === 'cancelled' ? '已停止生成' : null}
                  </div>
                  {assistantStatusText && (hasReasoning || displayText) ? (
                    <div className={`${styles.assistantStatus} ${message.deliveryStatus === 'cancelled' ? styles.assistantStatusCancelled : styles.assistantStatusFailed}`}>
                      {assistantStatusText}
                    </div>
                  ) : null}
                  {message.role === 'assistant' ? (
                    <ToolDetailSection
                      message={message}
                      expanded={expandedToolMessages.has(message.id)}
                      onToggle={() =>
                        setExpandedToolMessages((prev) => {
                          const next = new Set(prev)
                          if (next.has(message.id)) next.delete(message.id)
                          else next.add(message.id)
                          return next
                        })
                      }
                      styles={styles}
                    />
                  ) : null}
                  {message.role === 'assistant' && message.actionButton?.label ? (
                    <div className={styles.messageActionRow}>
                      <button
                        type="button"
                        className={styles.messageActionButton}
                        onClick={() => handleActionButtonClick(message)}
                      >
                        {message.actionButton.label}
                      </button>
                    </div>
                  ) : null}
                    </div>
                  )
                })()}
              </div>
            ))}

            <PendingConfirmationCard
              pendingConfirmation={pendingConfirmation}
              sending={sending}
              onCancel={handleCancel}
              onConfirm={handleConfirm}
              styles={styles}
            />
          </>
        ) : null}
      </div>

      {showJumpToLatest ? (
        <button
          type="button"
          className={styles.jumpToLatestButton}
          onClick={handleJumpToLatest}
          aria-label="回到底部"
        >
          <span className={styles.jumpToLatestIcon} aria-hidden="true">↓</span>
          最新内容
        </button>
      ) : null}

      <footer className={styles.chatFooter}>
        {pendingImages.length ? (
          <div className={styles.pendingImagesBar}>
            {pendingImages.map((img, index) => (
              <div key={img.dataUrl} className={styles.pendingThumbWrap}>
                <img src={img.dataUrl} alt={img.name || '待发送图片'} className={styles.pendingThumb} />
                <button type="button" className={styles.pendingThumbRemove} onClick={() => handleRemovePendingImage(index)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className={styles.composer}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={styles.input}
            placeholder="尽管问，让你成为穿搭达人..."
            disabled={sending || status !== 'success'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleSend()
              }
            }}
          />
          <button
            type="button"
            className={styles.plusButton}
            disabled={sending || status !== 'success'}
            onClick={openActions}
            aria-label="更多操作"
          >
            +
          </button>
          <button
            type="button"
            className={`${styles.sendButton} ${sending ? styles.sendButtonStop : ''}`}
            onClick={() => {
              if (sending) {
                stopStreaming()
                return
              }
              void handleSend()
            }}
            disabled={status !== 'success'}
          >
            {sending ? '■' : '>'}
          </button>
        </div>
        <input ref={imagePickerRef} type="file" accept="image/*" multiple hidden onChange={handlePickImage} />
      </footer>

      <Popup
        visible={historyVisible}
        onMaskClick={() => setHistoryVisible(false)}
        position="bottom"
        bodyClassName={styles.sheetPopup}
      >
        <AgentHistoryPanel
          sessionId={sessionId}
          session={session}
          sessionList={sessionList}
          loadSessionList={loadSessionList}
          requestDeleteSession={async (targetSessionId, shouldLeaveChat) => {
            try {
              await axios.delete(`/unified-agent/sessions/${targetSessionId}`)
              Toast.show({ icon: 'success', content: '已删除', duration: 1000 })

              if (!shouldLeaveChat) {
                setSessionList((prev) => prev.filter((item) => item.id !== targetSessionId))
              }

              return true
            } catch (deleteError) {
              console.error('删除历史会话失败:', deleteError)
              Toast.show({ icon: 'fail', content: '删除失败', duration: 1200 })
              return false
            }
          }}
          onClearAll={async () => {
            try {
              await axios.delete('/unified-agent/sessions')
              Toast.show({ icon: 'success', content: '已清空全部会话', duration: 1000 })
              navigate('/unified-agent', { replace: true })
            } catch (error) {
              console.error('清空全部会话失败:', error)
              Toast.show({ icon: 'fail', content: '清空失败，请重试', duration: 1200 })
            }
          }}
          onSelectSession={selectHistorySession}
          onClose={() => setHistoryVisible(false)}
          onExpandFull={expandHistoryPage}
          embedded
        />
      </Popup>

      <Popup
        visible={actionsVisible}
        onMaskClick={() => setActionsVisible(false)}
        position="bottom"
        bodyClassName={styles.sheetPopup}
      >
        <div className={styles.sheet}>
          <div className={styles.sheetHandle} />
          <div className={styles.sheetTitleSmall}>更多操作</div>
          <button type="button" className={styles.actionItem} onClick={handleOpenAlbum}>
            上传图片
          </button>
          <button type="button" className={styles.actionItem} onClick={createNewSession}>
            新建会话
          </button>
          <button type="button" className={styles.actionItem} onClick={openHistory}>
            查看历史会话
          </button>
          <button type="button" className={styles.actionItem} onClick={() => handleFillPrompt('帮我推荐今天穿什么')}>
            场景推荐
          </button>
          <button type="button" className={styles.actionItem} onClick={() => handleFillPrompt('教我怎么使用这个页面')}>
            使用帮助
          </button>
          <button type="button" className={styles.actionItem} onClick={handleRenameSession} disabled={renaming}>
            {renaming ? '保存中...' : '重命名会话'}
          </button>
          <button type="button" className={`${styles.actionItem} ${styles.actionDanger}`} onClick={clearMessages}>
            清空会话
          </button>
          <button type="button" className={`${styles.actionItem} ${styles.actionDanger}`} onClick={deleteSession}>
            删除会话
          </button>
          <button type="button" className={styles.actionPrimary} onClick={() => setActionsVisible(false)}>
            取消
          </button>
        </div>
      </Popup>
    </div>
  )
}
