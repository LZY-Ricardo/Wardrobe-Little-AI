import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Loading } from 'react-vant'
import { Toast } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'

import axios from '@/api'
import { buildAgentContextState } from '@/utils/agentContext'
import test from '@/assets/test.jpg'
import { useAuthStore, useMatchStore } from '@/store'
import { buildPreviewStageModel } from './viewModel'

import styles from './index.module.less'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const MATCH_CACHE_TTL = 5 * 60 * 1000

const safeParseUserInfo = () => {
  const raw = localStorage.getItem('userInfo')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.error('解析用户信息失败:', err)
    return null
  }
}

const PROGRESS_STAGES = [
  { label: '正在上传图片...', sub: '准备你的衣物和模特照片', duration: 3000 },
  { label: 'AI 正在生成搭配预览...', sub: '这可能需要一点时间', duration: 6000 },
  { label: '即将完成...', sub: '搭配效果马上呈现', duration: Infinity },
]

const renderSlotPlaceholder = (slotKey) => {
  if (slotKey === 'top') {
    return (
      <svg
        className={styles.slotPlaceholderIcon}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M22 20h20l4 8v18c0 2-2 4-4 4H22c-2 0-4-2-4-4V28l4-8z"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M28 20a4 4 0 0 0 8 0"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg
      className={styles.slotPlaceholderIcon}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M20 18h24"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 18v28c0 2 2 4 4 4h8c2 0 4-2 4-4V18"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 18v32"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function Match({ embedded = false }) {
  const navigate = useNavigate()
  const authUserInfo = useAuthStore((s) => s.userInfo)
  const accessToken = useAuthStore((s) => s.accessToken)
  const setAuthUserInfo = useAuthStore((s) => s.setUserInfo)
  const [activeTab, setActiveTab] = useState('top')
  const [showPreview, setShowPreview] = useState(false)
  const [topClothes, setTopClothes] = useState(null)
  const [bottomClothes, setBottomClothes] = useState(null)
  const { topItems, bottomItems, fetchedAt, ownerId, setClothes, clear } = useMatchStore()
  const [previewImageUrl, setPreviewImageUrl] = useState('')
  const [userInfo, setUserInfo] = useState(() => authUserInfo || safeParseUserInfo())
  const [userLoading, setUserLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progressStage, setProgressStage] = useState(0)
  const materialScrollRef = useRef(null)

  const currentUserId = userInfo?.id || authUserInfo?.id || null
  const sex = userInfo?.sex || ''
  const characterModelRaw = userInfo?.characterModel || ''
  const characterModel =
    typeof characterModelRaw === 'string' && characterModelRaw.startsWith('/')
      ? `${API_BASE_URL}${characterModelRaw}`
      : characterModelRaw
  const cacheForUser = ownerId && currentUserId && String(ownerId) === String(currentUserId)
  const hasCache = cacheForUser && (topItems.length > 0 || bottomItems.length > 0 || fetchedAt > 0)
  const cacheFresh = hasCache && fetchedAt > 0 && Date.now() - fetchedAt < MATCH_CACHE_TTL
  const currentLookClothes = [topClothes, bottomClothes].filter(Boolean)
  const canHandOffLook = currentLookClothes.length >= 2
  const visibleMaterials = activeTab === 'top' ? topItems : bottomItems

  const stageModel = useMemo(
    () =>
      buildPreviewStageModel({
        topClothes,
        bottomClothes,
        showPreview,
      }),
    [topClothes, bottomClothes, showPreview]
  )

  const clearPreview = () => {
    setShowPreview(false)
    setPreviewImageUrl('')
  }

  const handleTabChange = (nextTab) => {
    if (nextTab === activeTab) return
    if (materialScrollRef.current) materialScrollRef.current.scrollLeft = 0
    setActiveTab(nextTab)
  }

  useEffect(() => {
    if (!materialScrollRef.current) return
    materialScrollRef.current.scrollLeft = 0
  }, [activeTab])

  const openAgentForCurrentLook = useCallback(() => {
    if (!canHandOffLook) {
      Toast.show({ content: '请先选择上衣和下衣', duration: 1000 })
      return
    }

    const itemIds = currentLookClothes
      .map((item) => Number(item?.cloth_id || 0))
      .filter((id) => Number.isInteger(id) && id > 0)

    if (itemIds.length < 2) {
      Toast.show({ content: '当前搭配缺少可保存的衣物信息', duration: 1200 })
      return
    }

    const itemNames = currentLookClothes.map((item) => item?.name || item?.type || '').filter(Boolean)

    navigate('/unified-agent', {
      state: buildAgentContextState({
        presetTask: `继续处理我当前选中的这套搭配：${itemNames.join(' + ')}`,
        draft: {
          type: 'suit',
          entity: {
            name: itemNames.join(' + '),
            scene: '搭配中心',
            description: itemNames.join(' + '),
            source: 'match-page',
            items: itemIds,
          },
        },
        latestTask: {
          manualSuitDraft: {
            name: itemNames.join(' + '),
            scene: '搭配中心',
            description: itemNames.join(' + '),
            source: 'match-page',
            items: itemIds,
          },
          manualOutfitLogDraft: {
            logDate: new Date().toISOString().slice(0, 10),
            scene: '搭配中心',
            source: 'match-page',
            note: itemNames.join(' + '),
            items: itemIds,
          },
        },
      }),
    })
  }, [canHandOffLook, currentLookClothes, navigate])

  const fetchUserInfo = useCallback(async (forceRefresh = false) => {
    setUserLoading(true)
    try {
      const authStore = useAuthStore.getState()
      const nextUser = await authStore.fetchUserInfo(forceRefresh)

      if (nextUser) {
        setUserInfo(nextUser)
        setAuthUserInfo(nextUser)
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    } finally {
      setUserLoading(false)
    }
  }, [setAuthUserInfo, setUserInfo])

  useEffect(() => {
    if (accessToken) fetchUserInfo()
  }, [accessToken, fetchUserInfo])

  useEffect(() => {
    if (authUserInfo) {
      setUserInfo((prev) => prev || authUserInfo)
    }
  }, [authUserInfo])

  useEffect(() => {
    if (!ownerId || !currentUserId) return
    if (String(ownerId) !== String(currentUserId)) {
      clear()
    }
  }, [ownerId, currentUserId, clear])

  const getClothesData = useCallback(async () => {
    try {
      const [resTop, resBot] = await Promise.all([
        axios.get('/clothes/TopClothes'),
        axios.get('/clothes/BotClothes'),
      ])
      setClothes(resTop?.data || [], resBot?.data || [], currentUserId)
    } catch (err) {
      console.error('获取衣物失败:', err)
      Toast.show({ content: '获取衣物失败，请稍后重试', duration: 1200 })
    }
  }, [setClothes, currentUserId])

  const handleGenerate = async () => {
    if (!topClothes?.image || !bottomClothes?.image) {
      Toast.show({ content: '请选择上衣和下衣', duration: 1000 })
      return
    }
    if (sex !== 'man' && sex !== 'woman') {
      Toast.show({ content: '请您先设置性别', duration: 1000 })
      navigate('/person')
      return
    }
    if (!characterModel) {
      Toast.show({ content: '请您先设置人物模特', duration: 1000 })
      navigate('/person')
      return
    }

    try {
      const top = await fetch(topClothes.image)
      const bottom = await fetch(bottomClothes.image)
      const model = await fetch(characterModel)

      const topBlob = await top.blob()
      const bottomBlob = await bottom.blob()
      const modelBlob = await model.blob()

      const topFile = new File([topBlob], 'top.jpg', { type: 'image/jpeg' })
      const bottomFile = new File([bottomBlob], 'bottom.jpg', { type: 'image/jpeg' })
      const modelFile = new File([modelBlob], 'model.jpg', { type: 'image/jpeg' })

      const formData = new FormData()
      formData.append('top', topFile)
      formData.append('bottom', bottomFile)
      formData.append('sex', sex)
      formData.append('characterModel', modelFile)

      setLoading(true)
      setProgressStage(0)

      const stageTimers = []
      PROGRESS_STAGES.forEach((stage, i) => {
        if (i === 0 || stage.duration === Infinity) return
        const delay = PROGRESS_STAGES.slice(0, i).reduce((sum, s) => sum + s.duration, 0)
        stageTimers.push(setTimeout(() => setProgressStage(i), delay))
      })

      const res = await axios.post('/clothes/genPreview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 90000,
      })

      stageTimers.forEach(clearTimeout)

      if (res && res.code === 1 && res.data) {
        setPreviewImageUrl(res.data)
        setShowPreview(true)
        Toast.show({ content: '预览图生成成功！', duration: 1000 })
      } else {
        Toast.show({ content: '预览图生成失败，请重试', duration: 1000 })
      }
    } catch (error) {
      console.log('生成预览图错误:', error)
      Toast.show({ content: '预览图生成失败，请重试', duration: 1000 })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!currentUserId) return
    if (cacheFresh) return
    void getClothesData()
  }, [cacheFresh, getClothesData, currentUserId])

  return (
    <div className={styles.match}>
      <div className={styles.loadingOverlay} style={{ display: loading || userLoading ? 'flex' : 'none' }}>
        {userLoading ? (
          <Loading size="24px" textColor="#2a64f6" color="#2a64f6">
            正在获取用户信息...
          </Loading>
        ) : (
          <div className={styles.progressPanel}>
            <div className={styles.progressSpinner}>
              <Loading size="32px" color="#2a64f6" />
            </div>
            <div className={styles.progressLabel}>{PROGRESS_STAGES[progressStage]?.label}</div>
            <div className={styles.progressSub}>{PROGRESS_STAGES[progressStage]?.sub}</div>
            <div className={styles.progressBarTrack}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${Math.min(90, ((progressStage + 1) / PROGRESS_STAGES.length) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {embedded ? null : (
        <div className={styles.matchHeader}>
          <div className={styles.matchHeaderTitle}>搭配中心</div>
        </div>
      )}

      <div className={styles.matchBody}>
        <section className={styles.selectorCard}>
          <div className={styles.segmented}>
            <button
              type="button"
              className={`${styles.segmentButton} ${activeTab === 'top' ? styles.segmentButtonActive : ''}`}
              onClick={() => handleTabChange('top')}
            >
              上衣
            </button>
            <button
              type="button"
              className={`${styles.segmentButton} ${activeTab === 'bottom' ? styles.segmentButtonActive : ''}`}
              onClick={() => handleTabChange('bottom')}
            >
              下衣
            </button>
          </div>

          <div className={styles.materialRail} ref={materialScrollRef}>
            {visibleMaterials.map((item, index) => {
              const selected = activeTab === 'top' ? topClothes === item : bottomClothes === item
              return (
                <button
                  type="button"
                  key={item?.cloth_id || index}
                  className={`${styles.materialCard} ${selected ? styles.materialCardActive : ''}`}
                  onClick={() => {
                    if (activeTab === 'top') {
                      setTopClothes(item)
                    } else {
                      setBottomClothes(item)
                    }
                    clearPreview()
                  }}
                >
                  <div className={styles.materialImageWrap}>
                    <img
                      src={item?.image || test}
                      alt={item?.name || (activeTab === 'top' ? '上衣' : '下衣')}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = test
                      }}
                    />
                  </div>
                  <div className={styles.materialName}>{item?.name || '未命名单品'}</div>
                </button>
              )
            })}
          </div>
        </section>

        <section className={styles.stageCard}>
          <div className={styles.stageHeader}>
            <div className={styles.stageTitle}>搭配预览</div>
            <div className={styles.stageSubtitle}>{stageModel.hint}</div>
          </div>

          {showPreview && previewImageUrl ? (
            <div className={styles.generatedPreview}>
              <div className={styles.generatedPreviewFrame}>
                <img
                  src={previewImageUrl}
                  alt="预览图"
                  loading="lazy"
                  onError={(e) => {
                    console.error('图片加载失败:', previewImageUrl)
                    e.currentTarget.src = test
                  }}
                />
              </div>
            </div>
          ) : stageModel.hasInstantLook ? (
            <div className={styles.instantLook}>
              <div className={styles.instantCanvas}>
                <div className={styles.instantBadge}>实时拼贴</div>
                <div className={styles.instantTop}>
                  <img
                    src={topClothes.image}
                    alt={topClothes.name || '上衣'}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = test
                    }}
                  />
                </div>
                <div className={styles.instantDivider} />
                <div className={styles.instantBottom}>
                  <img
                    src={bottomClothes.image}
                    alt={bottomClothes.name || '下衣'}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = test
                    }}
                  />
                </div>
              </div>
              <div className={styles.instantChips}>
                {stageModel.slotChips.map((item) => (
                  <span key={item} className={styles.instantChip}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.stageSlots}>
              {stageModel.slots.map((slot) => (
                <div
                  key={slot.key}
                  className={`${styles.stageSlot} ${slot.selected ? styles.stageSlotActive : ''}`}
                >
                  <div className={styles.stageSlotImage}>
                    {slot.image ? (
                      <img
                        src={slot.image}
                        alt={slot.name}
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.src = test
                        }}
                      />
                    ) : (
                      <div className={styles.slotPlaceholder}>{renderSlotPlaceholder(slot.key)}</div>
                    )}
                  </div>
                  <div className={styles.stageSlotMeta}>
                    <div className={`${styles.stageSlotLabel} ${slot.selected ? '' : styles.stageSlotLabelMuted}`}>
                      {slot.label}
                    </div>
                    <div className={styles.stageSlotState}>{slot.selected ? slot.name : '待选择'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.ghostAction}
              onClick={() => {
                clearPreview()
                setTopClothes(null)
                setBottomClothes(null)
                if (materialScrollRef.current) materialScrollRef.current.scrollLeft = 0
                Toast.show({
                  content: '已清空选择',
                  duration: 1000,
                })
              }}
            >
              清空
            </button>
            <button type="button" className={styles.secondaryAction} onClick={openAgentForCurrentLook}>
              交给 Agent
            </button>
            <button type="button" className={styles.primaryAction} onClick={handleGenerate}>
              生成预览图
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
