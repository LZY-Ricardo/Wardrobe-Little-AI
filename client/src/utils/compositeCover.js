const loadImage = (src) =>
  new Promise((resolve, reject) => {
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

export const createCompositeCover = async (images = []) => {
  if (!images.length) return ''
  const canvas = document.createElement('canvas')
  const width = 900
  const height = 900
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const palette = pickPalette()
  ctx.fillStyle = palette.bg
  roundRect(ctx, 0, 0, width, height, 32)
  ctx.fill()
  ctx.strokeStyle = palette.stroke
  ctx.lineWidth = 1
  roundRect(ctx, 6, 6, width - 12, height - 12, 28)
  ctx.stroke()

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

export const buildCompositeCover = async (items = []) => {
  const uniq = (arr) => Array.from(new Set(arr))
  const images = uniq(items.map((item) => item?.image || item).filter(Boolean)).slice(0, 3)
  if (!images.length) return ''
  try {
    return await createCompositeCover(images)
  } catch (err) {
    console.error('create composite cover failed:', err)
    return ''
  }
}
