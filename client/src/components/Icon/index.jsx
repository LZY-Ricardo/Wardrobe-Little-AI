import './index.css'

const joinClass = (...parts) => parts.filter(Boolean).join(' ').trim()

const Icon = ({ type, className = '', style = {}, onClick }) => {
  return (
    <i
      className={joinClass('iconfont', type ? `icon-${type}` : '', className)}
      style={style}
      onClick={onClick}
    >
    </i>
  )
}
export default Icon
