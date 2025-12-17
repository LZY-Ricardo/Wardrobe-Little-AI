import './index.css'

const dedupe = (list) => Array.from(new Set(list.filter(Boolean)))

const normalizeType = (type) => {
  if (!type) return []
  return String(type)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (token.startsWith('icon-') || token === 'iconfont' ? token : `icon-${token}`))
}

const joinClass = (...parts) =>
  dedupe(
    parts.flatMap((item) => {
      if (Array.isArray(item)) return item
      return String(item || '')
        .split(/\s+/)
        .filter(Boolean)
    })
  )
    .join(' ')
    .trim()

const Icon = ({ type, className = '', style = {}, onClick }) => {
  const classes = joinClass('iconfont', normalizeType(type), className)
  return (
    <i
      className={classes}
      style={style}
      onClick={onClick}
    >
    </i>
  )
}
export default Icon
