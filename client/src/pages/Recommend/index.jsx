import React, { useState } from 'react'
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
  const hit = [
    { key: ['约会', '恋爱'], bgFrom: '#ffe7f2', bgTo: '#ffd7ec', card: '#fff8fb', accent: '#ff8fb1' },
    { key: ['商务', '通勤'], bgFrom: '#e7eeff', bgTo: '#dfe8ff', card: '#f7f9ff', accent: '#4f81ff' },
    { key: ['运动', '健身'], bgFrom: '#e8fff4', bgTo: '#d1f7e6', card: '#f7fffb', accent: '#22c55e' },
    { key: ['旅行', '度假'], bgFrom: '#e8f7ff', bgTo: '#d9f0ff', card: '#f7fcff', accent: '#38bdf8' },
  ].find((p) => p.key.some((k) => scene.includes(k)))
  return hit || { bgFrom: '#f5f5f5', bgTo: '#ededed', card: '#ffffff', accent: '#9ca3af' }
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

  // 主卡片区域
  const layout = [
    { x: 70, y: 50, w: 760, h: 520, rotate: 0 },
    { x: 70, y: 600, w: 360, h: 240, rotate: -4 },
    { x: 470, y: 600, w: 360, h: 240, rotate: 4 },
  ]

  const imgs = await Promise.all(images.map((url) => loadImage(url)))
  imgs.slice(0, 3).forEach((img, idx) => {
    const cell = layout[idx] || layout[layout.length - 1]
    ctx.save()
    ctx.translate(cell.x + cell.w / 2, cell.y + cell.h / 2)
    ctx.rotate((cell.rotate * Math.PI) / 180)
    ctx.translate(-(cell.x + cell.w / 2), -(cell.y + cell.h / 2))

    // 卡片底
    ctx.fillStyle = palette.card
    ctx.shadowColor = 'rgba(0,0,0,0.12)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 8
    roundRect(ctx, cell.x, cell.y, cell.w, cell.h, 24)
    ctx.fill()

    // 图片
    const scale = Math.min((cell.w - 30) / img.width, (cell.h - 30) / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    const dx = cell.x + (cell.w - dw) / 2
    const dy = cell.y + (cell.h - dh) / 2
    ctx.shadowColor = 'rgba(0,0,0,0.08)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 6
    roundRect(ctx, dx, dy, dw, dh, 18)
    ctx.clip()
    ctx.drawImage(img, dx, dy, dw, dh)
    ctx.restore()
  })

  // 底部装饰条
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0)'
  ctx.fillStyle = palette.accent
  roundRect(ctx, width - 170, height - 70, 120, 20, 10)
  ctx.fill()
  ctx.restore()

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
                  <div className={styles['item-chip']} key={`${item.id}-${cloth.cloth_id || idx}`}>
                    {cloth.name || cloth.type || '搭配单品'}
                    {cloth.color ? ` · ${cloth.color}` : ''}
                  </div>
                ))}
              </div>
            )}
            <div className={styles['item-actions']}>
              <SvgIcon iconName="icon-icon-test" className={styles['action-icon']} />
              <SvgIcon iconName="icon-aixin" className={styles['action-icon']} />
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
