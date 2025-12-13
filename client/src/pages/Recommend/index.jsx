import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import styles from './index.module.less'
import SvgIcon from '@/components/SvgIcon'
import { Button, Toast } from 'antd-mobile'
import axios from '@/api'

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

const pickPalette = (scene = '') => {
  const name = scene || ''
  const map = [
    {
      keys: ['约会', '恋爱'],
      bgFrom: '#fdf2f8',
      bgTo: '#f3e8ff',
      card: '#ffffff',
      accent: '#f9a8d4',
      blur: [
        { x: 200, y: 180, r: 200, color: 'rgba(249,168,212,0.22)' },
        { x: 700, y: 220, r: 180, color: 'rgba(196,181,253,0.18)' },
      ],
    },
    {
      keys: ['运动', '健身'],
      bgFrom: '#f7fdf9',
      bgTo: '#eef7ff',
      card: '#ffffff',
      accent: '#34d399',
      blur: [
        { x: 160, y: 140, r: 180, color: 'rgba(52,211,153,0.16)' },
        { x: 720, y: 160, r: 160, color: 'rgba(96,165,250,0.14)' },
      ],
    },
    {
      keys: ['商务', '通勤'],
      bgFrom: '#f8fafc',
      bgTo: '#f1f5f9',
      card: '#ffffff',
      accent: '#cbd5e1',
      blur: [],
    },
  ]
  const hit = map.find((p) => p.keys.some((k) => name.includes(k)))
  return hit || { bgFrom: '#f9fafb', bgTo: '#f3f4f6', card: '#ffffff', accent: '#d1d5db', blur: [] }
}

const createComposite = async (images, scene = '') => {
  if (!images.length) return ''
  const canvas = document.createElement('canvas')
  const width = 900
  const height = 900
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const palette = pickPalette(scene)
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, palette.bgFrom)
  gradient.addColorStop(1, palette.bgTo)
  ctx.fillStyle = gradient
  roundRect(ctx, 0, 0, width, height, 36)
  ctx.fill()

  if (Array.isArray(palette.blur)) {
    palette.blur.forEach(({ x, y, r, color }) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, color)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    })
  }

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

export default function Recommend() {
  const location = useLocation()
  const lastPresetKeyRef = React.useRef('')
  const presetScene =
    typeof location?.state?.presetScene === 'string' ? location.state.presetScene.trim() : ''

  const [scene, setScene] = useState('')
  const [sceneSuits, setSceneSuits] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [serviceUnavailable, setServiceUnavailable] = useState(false)

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
          <div className={styles['content-item']} key={item.id}>
            <div className={styles['item-img']}>
              {item.cover ? <img src={item.cover} alt={item.scene} /> : <div className={styles['placeholder']}>No Image</div>}
              <div className={styles['item-actions-overlay']}>
                <SvgIcon iconName="icon-aixin" className={styles['action-icon']} />
              </div>
            </div>
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
                    <div className={styles['item-row-name']}>
                      {(cloth.type || '单品') + '：'}{cloth.name || cloth.color || '搭配单品'}
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


