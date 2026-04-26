import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import styles from './index.module.less'
import SvgIcon from '@/components/SvgIcon'
import { Toast } from 'antd-mobile'
import { HeartFill, HeartOutline } from 'antd-mobile-icons'
import axios from '@/api'
import { buildAgentContextState } from '@/utils/agentContext'
import { extractClothIds, toSuitSignature } from '@/utils/suitSignature'
import { buildAutoSuitName } from '@/utils/suitName'
import { getTodayInChina } from '@/utils/date'
import { useSuitStore } from '@/store'
import { buildRecommendCardModel, buildRecommendViewModel } from './viewModel'

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = src
})

const roundRect = (ctx, x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

const pickPalette = () => ({
  bg: '#f7f9fc',
  card: '#ffffff',
  stroke: '#e6e8ef',
})

const createComposite = async (images, scene = '') => {
  if (!images.length) return ''
  const canvas = document.createElement('canvas')
  const width = 900
  const height = 900
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const palette = pickPalette(scene)
  ctx.fillStyle = palette.bg
  roundRect(ctx, 0, 0, width, height, 32)
  ctx.fill()
  ctx.strokeStyle = palette.stroke
  ctx.lineWidth = 1
  roundRect(ctx, 6, 6, width - 12, height - 12, 28)
  ctx.stroke()

  // grid layout: main on top, two subs bottom, unified 4:5 ratio
  const imgs = await Promise.all(images.map((url) => loadImage(url)))
  const [main, left, right] = imgs

  const gap = 28
  const mainWidth = width - gap * 2
  const mainHeight = Math.floor(height * 0.6)
  const subWidth = Math.floor((width - gap * 3) / 2)
  const subHeight = height - mainHeight - gap * 3
  const subY = mainHeight + gap * 2

  const drawCard = (img, x, y, w, h) => {
    if (!img) return
    ctx.save()
    ctx.fillStyle = palette.card
    ctx.shadowColor = 'rgba(0,0,0,0.10)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 8
    roundRect(ctx, x, y, w, h, 24)
    ctx.fill()

    const scale = Math.min((w - 40) / img.width, (h - 40) / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    const dx = x + (w - dw) / 2
    const dy = y + (h - dh) / 2
    ctx.shadowColor = 'rgba(0,0,0,0.05)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 4
    roundRect(ctx, dx, dy, dw, dh, 18)
    ctx.clip()
    ctx.drawImage(img, dx, dy, dw, dh)
    ctx.restore()
  }

  drawCard(main, gap, gap, mainWidth, mainHeight)
  drawCard(left, gap, subY, subWidth, subHeight)
  drawCard(right, gap * 2 + subWidth, subY, subWidth, subHeight)

  return canvas.toDataURL('image/png')
}

const attachCompositeCover = async (suits = []) => {
  const uniq = (arr) => Array.from(new Set(arr))
  const withCovers = await Promise.all(
    suits.map(async (suit) => {
      const images = uniq(
        (suit.items || [])
          .map((cloth) => cloth?.image)
          .filter(Boolean)
      ).slice(0, 3)
      if (!images.length) return suit
      try {
        const composite = await createComposite(images, suit.scene)
        if (composite) {
          return { ...suit, cover: composite }
        }
      } catch (err) {
        console.error('生成套装拼贴失败:', err)
      }
      return suit
    })
  )
  return withCovers
}

const normalizeSuits = (raw = [], fallbackScene = '') => {
  const sceneName = fallbackScene || '通用场景'
  let data = raw

  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      data = raw
    }
  }

  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.output)
        ? data.output
        : Array.isArray(data?.suits)
          ? data.suits
          : Array.isArray(data?.recommendations)
            ? data.recommendations
            : typeof data === 'string'
              ? data
                .split(/\n+/)
                .map((line) => ({ description: line.trim(), scene: sceneName }))
                .filter((item) => item.description)
              : []

  return list.map((item, index) => ({
    id: item.id ?? index,
    scene: item.scene || item.sceneName || sceneName,
    source: item.source || 'llm',
    description: item.reason || item.message || item.description || item.desc || `AI 推荐搭配 ${index + 1}`,
    items: item.items || item.suits || item.clothes || [],
    cover: item.image
      || item.cover
      || item.img
      || (Array.isArray(item.items) ? item.items.find((cloth) => cloth?.image)?.image : '')
      || '',
  }))
}

const isFavorited = (value) => value === 1 || value === true || value === '1' || value === 'true'

export default function Recommend({ embedded = false }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const fetchAllSuits = useSuitStore((s) => s.fetchAllSuits)
  const invalidateSuitCache = useSuitStore((s) => s.invalidateCache)
  const lastPresetKeyRef = React.useRef('')
  const presetScene =
    searchParams.get('presetScene')?.trim() ||
    (typeof location?.state?.presetScene === 'string' ? location.state.presetScene.trim() : '')

  const [scene, setScene] = useState('')
  const [sceneSuits, setSceneSuits] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [serviceUnavailable, setServiceUnavailable] = useState(false)
  const [favoriteUpdating, setFavoriteUpdating] = useState({})
  const [suitSaving, setSuitSaving] = useState({})
  const [savedSuitSignatures, setSavedSuitSignatures] = useState(new Set())
  const [latestRecommendationId, setLatestRecommendationId] = useState(null)

  const fetchSavedSuits = React.useCallback(async (forceRefresh = false) => {
    try {
      const list = await fetchAllSuits(forceRefresh)
      const items = Array.isArray(list) ? list : []
      const sigs = new Set(
        items
          .map((suit) => toSuitSignature(extractClothIds(suit.items || [])))
          .filter(Boolean)
      )
      setSavedSuitSignatures(sigs)
    } catch (err) {
      console.warn('Failed to load suits', err)
    }
  }, [fetchAllSuits])

  React.useEffect(() => {
    void fetchSavedSuits()
  }, [fetchSavedSuits])

  const handleBtnClick = () => {
    const value = scene.trim()
    if (!value) {
      Toast.show({ content: '请输入场景，如商务/通勤/约会', duration: 1200 })
      return
    }
    generateSceneSuits(value)
  }

  const buildHistoryPayload = React.useCallback((value, suits = []) => ({
    recommendationType: 'scene',
    scene: value,
    triggerSource: embedded ? 'match-hub' : 'recommend-page',
    suits: suits.map((item, index) => ({
      id: item?.id ?? index,
      scene: item?.scene || value,
      source: item?.source || 'llm',
      description: item?.description || item?.reason || '',
      items: Array.isArray(item?.items)
        ? item.items.map((cloth) => ({
            cloth_id: cloth?.cloth_id,
            name: cloth?.name || '',
            type: cloth?.type || '',
            color: cloth?.color || '',
            style: cloth?.style || '',
            season: cloth?.season || '',
          }))
        : [],
    })),
  }), [embedded])

  const generateSceneSuits = React.useCallback(async (value) => {
    setLoading(true)
    setError('')
    setServiceUnavailable(false)
    setLatestRecommendationId(null)
    try {
      const res = await axios.post('/scene/generateSceneSuits', { scene: value })
      const list = normalizeSuits(res?.data ?? res, value)
      if (!list.length) {
        setSceneSuits([])
        setError('暂无推荐结果，换个场景试试')
        return
      }
      try {
        const saved = await axios.post('/recommendations', buildHistoryPayload(value, list))
        const recommendationId = saved?.data?.id || null
        setLatestRecommendationId(recommendationId)
      } catch (historyError) {
        console.warn('保存推荐历史失败:', historyError)
      }
      const withCovers = await attachCompositeCover(list)
      setSceneSuits(withCovers)
    } catch (err) {
      const status = err?.response?.status
      const message =
        err?.msg ||
        err?.message ||
        err?.response?.data?.msg ||
        err?.data?.msg ||
        '推荐服务不可用，请稍后重试'
      setError(message)
      setSceneSuits([])
      if (!status || status >= 500 || status === 503) {
        setServiceUnavailable(true)
      }
    } finally {
      setLoading(false)
    }
  }, [buildHistoryPayload])

  const applyFavoritePatch = (patch = {}) => {
    const keys = Object.keys(patch)
    if (!keys.length) return

    setSceneSuits((prev) =>
      prev.map((suit) => {
        if (!Array.isArray(suit.items) || suit.items.length === 0) return suit
        let changed = false
        const nextItems = suit.items.map((cloth) => {
          const clothId = cloth?.cloth_id
          if (!clothId) return cloth
          if (!Object.prototype.hasOwnProperty.call(patch, clothId)) return cloth
          const nextFavorite = patch[clothId] ? 1 : 0
          if (cloth.favorite === nextFavorite) return cloth
          changed = true
          return { ...cloth, favorite: nextFavorite }
        })
        return changed ? { ...suit, items: nextItems } : suit
      })
    )
  }

  const toggleClothFavorite = async (cloth) => {
    const clothId = cloth?.cloth_id
    if (!clothId) return
    if (favoriteUpdating[clothId]) return

    const prevFavorite = isFavorited(cloth.favorite)
    const nextFavorite = !prevFavorite

    setFavoriteUpdating((prev) => ({ ...prev, [clothId]: true }))
    applyFavoritePatch({ [clothId]: nextFavorite })

    try {
      await axios.put(`/clothes/${clothId}`, { favorite: nextFavorite ? 1 : 0 })
      Toast.show({ content: nextFavorite ? '已收藏' : '已取消收藏', duration: 900 })
    } catch (err) {
      console.error('更新收藏状态失败:', err)
      applyFavoritePatch({ [clothId]: prevFavorite })
      Toast.show({ content: '操作失败，请重试', duration: 1200 })
    } finally {
      setFavoriteUpdating((prev) => {
        const next = { ...prev }
        delete next[clothId]
        return next
      })
    }
  }

  const saveSuitToLibrary = async (suit) => {
    const clothIds = extractClothIds(suit?.items)
    const signature = toSuitSignature(clothIds)
    if (!clothIds.length) {
      Toast.show({ content: '该套装缺少单品，无法收藏', duration: 1200 })
      return
    }
    if (clothIds.length < 2) {
      Toast.show({ content: '套装至少需要 2 件单品', duration: 1200 })
      return
    }
    if (savedSuitSignatures.has(signature)) {
      Toast.show({ content: '已在套装库中', duration: 900 })
      return
    }
    if (suitSaving[signature]) return

    setSuitSaving((prev) => ({ ...prev, [signature]: true }))
    try {
      await axios.post('/suits', {
        name: buildAutoSuitName(suit?.scene || ''),
        scene: suit?.scene || '',
        description: suit?.description || suit?.message || suit?.reason || '',
        cover: suit?.cover || '',
        source: 'recommend',
        items: clothIds,
      })
      if (latestRecommendationId) {
        try {
          await axios.put(`/recommendations/${latestRecommendationId}/adopt`, {
            adopted: 1,
            saved_as_suit: 1,
          })
        } catch (adoptError) {
          console.warn('更新推荐采纳状态失败:', adoptError)
        }
      }
      setSavedSuitSignatures((prev) => {
        const next = new Set(prev)
        if (signature) next.add(signature)
        return next
      })
      Toast.show({ content: '已加入套装库', duration: 1000 })
      invalidateSuitCache()
    } catch (err) {
      Toast.show({ content: err?.msg || '收藏失败，请重试', duration: 1200 })
    } finally {
      setSuitSaving((prev) => {
        const next = { ...prev }
        delete next[signature]
        return next
      })
    }
  }

  const createOutfitLogFromSuit = async (suit) => {
    const clothIds = extractClothIds(suit?.items)
    if (!clothIds.length) {
      Toast.show({ content: '该推荐缺少可记录的单品', duration: 1200 })
      return
    }
    try {
      await axios.post('/outfit-logs', {
        recommendationId: latestRecommendationId,
        logDate: getTodayInChina(),
        scene: suit?.scene || scene,
        source: 'recommendation',
        note: suit?.description || '',
        items: clothIds,
      })
      Toast.show({ content: '已记录到穿搭历史', duration: 1000 })
    } catch (err) {
      console.error('记录穿搭失败:', err)
      Toast.show({ content: err?.msg || '记录失败，请重试', duration: 1200 })
    }
  }

  React.useEffect(() => {
    if (!presetScene) return
    if (lastPresetKeyRef.current === presetScene) return
    lastPresetKeyRef.current = presetScene
    setScene(presetScene)
    void generateSceneSuits(presetScene)
  }, [generateSceneSuits, presetScene])

  const pageModel = useMemo(
    () =>
      buildRecommendViewModel({
        scene,
        sceneSuits,
        serviceUnavailable,
      }),
    [scene, sceneSuits, serviceUnavailable]
  )

  const cardModels = useMemo(
    () =>
      sceneSuits.map((item) => {
        const signature = toSuitSignature(extractClothIds(item?.items))
        return buildRecommendCardModel(item, {
          isSaved: Boolean(signature && savedSuitSignatures.has(signature)),
          isSaving: Boolean(signature && suitSaving[signature]),
        })
      }),
    [sceneSuits, suitSaving, savedSuitSignatures]
  )

  const handleQuickSceneClick = (nextScene) => {
    setScene(nextScene)
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className={styles.stateCard}>AI 正在生成推荐...</div>
      )
    }
    if (error) {
      return (
        <div className={styles.stateCard}>
          <div className={styles.stateText}>{error}</div>
          <button type="button" className={styles.inlineRetry} onClick={handleBtnClick} disabled={serviceUnavailable}>
            重新尝试
          </button>
        </div>
      )
    }
    if (!sceneSuits.length) {
      return <div className={styles.stateCard}>暂无推荐，请输入场景后生成</div>
    }
    return (
      <div className={styles.resultsList}>
        {cardModels.map((model) => (
          <article key={model.id} className={`${styles.resultCard} ${styles[`tone-${model.sceneTone}`]}`}>
            <div className={styles.resultHead}>
              <span className={styles.sceneBadge}>{model.sceneLabel}</span>
              <span className={styles.sourceBadge}>{model.sourceLabel}</span>
            </div>

            <div className={styles.previewBoard}>
              <button
                type="button"
                className={styles.saveButton}
                disabled={model.isSaving || model.isSaved}
                onClick={() => void saveSuitToLibrary(model.raw)}
                aria-label={model.saveLabel}
              >
                {model.isSaved ? (
                  <HeartFill className={`${styles.saveIcon} ${styles.saveIconActive}`} />
                ) : (
                  <HeartOutline className={styles.saveIcon} />
                )}
              </button>

              <div className={styles.previewMain}>
                {model.previewImages.main?.image ? (
                  <img src={model.previewImages.main.image} alt={model.previewImages.main.alt} loading="lazy" />
                ) : (
                  <div className={styles.previewPlaceholder}>暂无封面</div>
                )}
              </div>

              <div className={styles.previewSecondaryRow}>
                {model.previewImages.secondary.map((preview) => (
                  <div key={preview.id} className={styles.previewSecondary}>
                    {preview.image ? (
                      <img src={preview.image} alt={preview.alt} loading="lazy" />
                    ) : (
                      <div className={styles.previewSecondaryEmpty} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.resultMessage}>{model.message}</div>

            <div className={styles.resultActions}>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => void createOutfitLogFromSuit(model.raw)}
              >
                记录穿搭
              </button>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() =>
                  navigate('/unified-agent', {
                    state: buildAgentContextState({
                      presetTask: `继续处理当前${model.sceneLabel || scene || '推荐'}结果`,
                      latestTask: {
                        taskType: 'recommendation',
                        summary: model.message,
                        result: {
                          suits: [model.raw],
                          recommendationHistoryId: latestRecommendationId,
                        },
                      },
                    }),
                  })
                }
              >
                交给 Agent
              </button>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureTitle}>{model.featuredItem.title}</div>
              <div className={styles.featureTags}>
                {model.featuredItem.tags.map((tag) => (
                  <span key={`${model.id}-${tag}`} className={styles.featureTag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {model.items.length > 1 ? (
              <div className={styles.itemList}>
                {model.items.slice(1).map((cloth, idx) => (
                  <div className={styles.itemRow} key={`${model.id}-${cloth.cloth_id || idx}`}>
                    <div className={styles.itemRowTop}>
                      <div className={styles.itemRowName}>
                        {(cloth.type || '单品') + '：'}
                        {cloth.name || cloth.color || '搭配单品'}
                      </div>
                      {cloth.cloth_id ? (
                        <button
                          type="button"
                          className={styles.itemRowAction}
                          disabled={Boolean(favoriteUpdating[cloth.cloth_id])}
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggleClothFavorite(cloth)
                          }}
                          aria-label={isFavorited(cloth.favorite) ? '取消收藏' : '收藏'}
                        >
                          {isFavorited(cloth.favorite) ? (
                            <HeartFill className={`${styles.itemRowFavIcon} ${styles.itemRowFavIconActive}`} />
                          ) : (
                            <HeartOutline className={styles.itemRowFavIcon} />
                          )}
                        </button>
                      ) : null}
                    </div>
                    <div className={styles.itemRowTags}>
                      {[cloth.color, cloth.style, cloth.season]
                        .filter(Boolean)
                        .map((tag, tagIdx) => (
                          <span className={styles.itemTag} key={`${model.id}-${cloth.cloth_id || idx}-tag-${tagIdx}`}>
                            {tag}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.recommend}>
      <section className={styles.heroCard}>
        <div className={styles.composerRow}>
          <label className={styles.inputCard}>
            <SvgIcon iconName="icon-icon-sousuo" className={styles.searchIcon} />
            <input
              type="text"
              placeholder="请输入场景，如约会、运动、商务"
              value={scene}
              onChange={(e) => setScene(e.target.value)}
              disabled={loading}
            />
          </label>

          <button type="button" className={styles.primaryAction} onClick={handleBtnClick} disabled={loading || serviceUnavailable}>
            {loading ? '生成中...' : '生成推荐'}
          </button>

          <button
            type="button"
            className={styles.historyButton}
            onClick={() => navigate('/recommendations/history')}
          >
            历史
          </button>
        </div>

        <div className={styles.quickSceneRow}>
          {pageModel.quickScenes.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.quickSceneChip} ${styles[`quickSceneChip-${item.tone}`]}`}
              onClick={() => handleQuickSceneClick(item.label)}
            >
              {item.label}
            </button>
          ))}
          {sceneSuits.length ? <span className={styles.resultsMeta}>{pageModel.resultMeta}</span> : null}
        </div>
      </section>

      <section className={styles.resultsPanel}>
        {renderContent()}
        {serviceUnavailable && pageModel.serviceStatus ? (
          <div className={styles.serviceFooter}>
            <SvgIcon iconName="icon-shuaxin" className={styles.serviceIcon} />
            <span>{pageModel.serviceStatus}</span>
          </div>
        ) : null}
      </section>
    </div>
  )
}


