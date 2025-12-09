import './index.css';

const SvgIcon = ({ iconName, className = '', style = {}, onClick }) => {
  const classes = ['icon', className].filter(Boolean).join(' ').trim()
  return (
    <svg
      className={classes}
      aria-hidden="true"
      style={style}
      onClick={onClick}
    >
      <use xlinkHref={`#${iconName}`}></use>
    </svg>
  )
}

export default SvgIcon
