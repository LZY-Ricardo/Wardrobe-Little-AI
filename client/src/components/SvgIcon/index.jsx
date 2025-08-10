import './index.css';

const SvgIcon = ({ iconName, className = '', style = {}, onClick }) => {
    return (
        <svg
            className=
            {`icon ${className}`}
            aria-hidden="true"
            style={style} onClick={onClick}
        >
            <use xlinkHref={`#${iconName}`}></use>
        </svg>
    );
};

export default SvgIcon;