import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import styles from './index.module.less'
import SvgIcon from '@/components/SvgIcon'
import { Button, Toast } from 'antd-mobile'
import { HeartFill, HeartOutline } from 'antd-mobile-icons'
import axios from '@/api'
import { extractClothIds, toSuitSignature } from '@/utils/suitSignature'
import { buildAutoSuitName } from '@/utils/suitName'

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

const getSceneTone = (scene = '') => {
  const name = scene || ''
  if (['约会', '恋爱'].some((k) => name.includes(k))) return 'tone-romance'
  if (['运动', '健身'].some((k) => name.includes(k))) return 'tone-sport'
  return 'tone-neutral'
}

const isFavorited = (value) => value === 1 || value === true || value === '1' || value === 'true'

export default function Recommend({ embedded = false }) {
  const location = useLocation()
  const lastPresetKeyRef = React.useRef('')
  const presetScene =
    typeof location?.state?.presetScene === 'string' ? location.state.presetScene.trim() : ''

  const [scene, setScene] = useState('')
  const [sceneSuits, setSceneSuits] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [serviceUnavailable, setServiceUnavailable] = useState(false)
  const [favoriteUpdating, setFavoriteUpdating] = useState({})
  const [suitSaving, setSuitSaving] = useState({})
  const [savedSuitSignatures, setSavedSuitSignatures] = useState(new Set())

  const fetchSavedSuits = React.useCallback(async () => {
    try {
      const res = await axios.get('/suits')
      const list = Array.isArray(res?.data) ? res.data : []
      const sigs = new Set(
        list
          .map((suit) => toSuitSignature(extractClothIds(suit.items || [])))
          .filter(Boolean)
      )
      setSavedSuitSignatures(sigs)
    } catch (err) {
      console.warn('加载套装库失败', err)
    }
  }, [])

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

  const generateSceneSuits = async (value) => {
    setLoading(true)
    setError('')
    setServiceUnavailable(false)
    try {
      const res = await axios.post('/scene/generateSceneSuits', { scene: value })
      const list = normalizeSuits(res?.data ?? res, value)
      if (!list.length) {
        setSceneSuits([])
        setError('暂无推荐结果，换个场景试试')
        return
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
  }

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

  const isSuitSaved = (suit) => {
    const signature = toSuitSignature(extractClothIds(suit?.items))
    if (!signature) return false
    return savedSuitSignatures.has(signature)
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
      setSavedSuitSignatures((prev) => {
        const next = new Set(prev)
        if (signature) next.add(signature)
        return next
      })
      Toast.show({ content: '已加入套装库', duration: 1000 })
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

  React.useEffect(() => {
    if (!presetScene) return
    if (lastPresetKeyRef.current === location.key) return
    lastPresetKeyRef.current = location.key
    setScene(presetScene)
    void generateSceneSuits(presetScene)
  }, [location.key, presetScene])

  const renderContent = () => {
    if (loading) {
      return (
        <div className={styles['loading']}>AI 正在生成推荐...</div>
      )
    }
    if (error) {
      return (
        <div className={styles['error']}>
          <span>{error}</span>
          <Button size="mini" onClick={handleBtnClick} disabled={serviceUnavailable}>
            重新尝试
          </Button>
        </div>
      )
    }
    if (!sceneSuits.length) {
      return <div className={styles['empty']}>暂无推荐，请输入场景后生成</div>
    }
    return (
      <div className={styles['recommend-body-content']}>
        {sceneSuits.map((item) => (
          <div className={`${styles['content-item']} ${styles[getSceneTone(item.scene)]}`} key={item.id}>
            <div className={styles['item-img']}>
              {item.cover ? <img src={item.cover} alt={item.scene} loading="lazy" /> : <div className={styles['placeholder']}>No Image</div>}
              <div className={styles['item-actions-overlay']}>
                {(() => {
                  const signature = toSuitSignature(extractClothIds(item.items))
                  const saved = isSuitSaved(item)
                  const saving = suitSaving[signature]
                  return saved ? (
                  <HeartFill
                    className={`${styles['action-icon']} ${styles['action-icon-active']}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void saveSuitToLibrary(item)
                    }}
                  />
                  ) : (
                  <HeartOutline
                      className={styles['action-icon']}
                      onClick={(e) => {
                        if (saving) return
                        e.stopPropagation()
                        void saveSuitToLibrary(item)
                      }}
                  />
                  )
                })()}
              </div>
            </div>
            <div className={styles['item-content']}>
              <div className={styles['item-header']}>
                <div className={styles['item-scene']}>{item.scene}</div>
                <div className={`${styles['item-source']} ${styles[`item-source-${item.source}`]}`}>
                  {item.source === 'rule' ? '规则推荐' : '模型推荐'}
                </div>
              </div>
              <div className={styles['item-message']}>{item.description}</div>
              {Boolean(item.items?.length) && (
                <div className={styles['item-list']}>
                  {item.items.map((cloth, idx) => (
                    <div className={styles['item-row']} key={`${item.id}-${cloth.cloth_id || idx}`}>
                      <div className={styles['item-row-header']}>
                        <div className={styles['item-row-name']}>
                          {(cloth.type || '单品') + '：'}{cloth.name || cloth.color || '搭配单品'}
                        </div>
                        {cloth.cloth_id ? (
                          <button
                            type="button"
                            className={styles['item-row-action']}
                            disabled={Boolean(favoriteUpdating[cloth.cloth_id])}
                            onClick={(e) => {
                              e.stopPropagation()
                              void toggleClothFavorite(cloth)
                            }}
                            aria-label={isFavorited(cloth.favorite) ? '取消收藏' : '收藏'}
                          >
                            {isFavorited(cloth.favorite) ? (
                              <HeartFill
                                className={`${styles['item-row-fav-icon']} ${styles['item-row-fav-icon-active']}`}
                              />
                            ) : (
                              <HeartOutline className={styles['item-row-fav-icon']} />
                            )}
                          </button>
                        ) : null}
                      </div>
                      <div className={styles['item-row-tags']}>
                        {[cloth.color, cloth.style, cloth.season]
                          .filter(Boolean)
                          .map((tag, tagIdx) => (
                            <span className={styles['item-tag']} key={`${item.id}-${cloth.cloth_id || idx}-tag-${tagIdx}`}>
                              {tag}
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={styles['recommend']}>
      <div className={styles['recommend-header']}>
        <SvgIcon iconName="icon-icon-sousuo" className={styles['search-icon']} />
        <input
          type="text"
          placeholder="请输入场景，如约会、运动、商务"
          value={scene}
          onChange={(e) => setScene(e.target.value)}
          disabled={loading}
        />
        <button onClick={handleBtnClick} disabled={loading || serviceUnavailable}>
          {loading ? '生成中...' : '生成推荐'}
        </button>
      </div>

      <div className={styles['recommend-body']}>
        <div className={styles['recommend-body-history']}>
          <div className={styles['history-item']} onClick={() => setScene('商务')}>商务</div>
          <div className={styles['history-item']} onClick={() => setScene('约会')}>约会</div>
          <div className={styles['history-item']} onClick={() => setScene('运动')}>运动</div>
        </div>
        {renderContent()}
        {serviceUnavailable && (
          <div className={styles['recommend-body-footer']}>
            <div className={styles['footer-btn']}>
              <SvgIcon iconName="icon-shuaxin" className={styles['btn-icon']} />
              服务暂不可用，请稍后重试
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


