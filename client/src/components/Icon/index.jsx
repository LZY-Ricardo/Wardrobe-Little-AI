import './index.css'

const Icon = ({ type, className = '', style = {}, onClick }) => {
    return (
        <i
            className={`iconfont icon-${type} ${className}`}
            style={style}
            onClick={onClick}
        >
        </i>
    )
}
export  default Icon