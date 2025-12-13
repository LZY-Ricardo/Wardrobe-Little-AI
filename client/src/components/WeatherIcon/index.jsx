const VIEWBOX = '0 0 64 64'

const toWeatherCode = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const resolveWeatherIconKey = ({ weatherCode, isDay, text }) => {
  const code = toWeatherCode(weatherCode)
  const day = typeof isDay === 'boolean' ? isDay : true
  const desc = String(text || '')

  if (code !== null) {
    if (code === 0 || code === 1) return day ? 'clear-day' : 'clear-night'
    if (code === 2) return day ? 'partly-day' : 'partly-night'
    if (code === 3) return 'cloudy'
    if (code === 45 || code === 48) return 'fog'
    if (code >= 51 && code <= 67) return 'rain'
    if (code >= 71 && code <= 77) return 'snow'
    if (code >= 80 && code <= 82) return 'rain'
    if (code === 85 || code === 86) return 'snow'
    if (code >= 95 && code <= 99) return 'thunder'
  }

  if (desc.includes('雷')) return 'thunder'
  if (desc.includes('雪')) return 'snow'
  if (desc.includes('雨')) return 'rain'
  if (desc.includes('雾')) return 'fog'
  if (desc.includes('晴')) return day ? 'clear-day' : 'clear-night'
  if (desc.includes('阴')) return 'cloudy'
  if (desc.includes('云')) return day ? 'partly-day' : 'partly-night'

  return 'cloudy'
}

const Rays = ({ cx = 32, cy = 32 }) =>
  [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
    <rect key={deg} x={cx - 2} y={cy - 26} width="4" height="10" rx="2" transform={`rotate(${deg} ${cx} ${cy})`} />
  ))

const Sun = ({ cx = 32, cy = 32 }) => (
  <g>
    <Rays cx={cx} cy={cy} />
    <circle cx={cx} cy={cy} r="10" />
  </g>
)

const Moon = ({ cx = 32, cy = 32 }) => (
  <path d={`M${cx + 12} ${cy - 16}a18 18 0 1 0 0 32a14 14 0 1 1 0-32z`} />
)

const CloudShape = ({ y = 24 }) => (
  <g>
    <circle cx="26" cy={y + 10} r="10" />
    <circle cx="38" cy={y + 6} r="12" />
    <circle cx="48" cy={y + 12} r="8" />
    <rect x="18" y={y + 10} width="38" height="18" rx="9" />
  </g>
)

const IconClearDay = () => <Sun />

const IconClearNight = () => <Moon />

const IconPartlyDay = () => (
  <g>
    <g transform="translate(-8 -8)">
      <Sun />
    </g>
    <CloudShape />
  </g>
)

const IconPartlyNight = () => (
  <g>
    <g transform="translate(-6 -8)">
      <Moon />
    </g>
    <CloudShape />
  </g>
)

const IconCloudy = () => <CloudShape />

const IconFog = () => (
  <g>
    <CloudShape />
    <rect x="18" y="52" width="30" height="4" rx="2" />
    <rect x="16" y="58" width="34" height="4" rx="2" />
  </g>
)

const IconRain = () => (
  <g>
    <CloudShape />
    <rect x="24" y="50" width="4" height="12" rx="2" />
    <rect x="32" y="52" width="4" height="10" rx="2" />
    <rect x="40" y="50" width="4" height="12" rx="2" />
  </g>
)

const Snowflake = ({ cx, cy }) => (
  <g transform={`translate(${cx} ${cy})`}>
    <rect x="-1" y="-6" width="2" height="12" rx="1" />
    <rect x="-6" y="-1" width="12" height="2" rx="1" />
    <rect x="-1" y="-6" width="2" height="12" rx="1" transform="rotate(45)" />
    <rect x="-6" y="-1" width="12" height="2" rx="1" transform="rotate(45)" />
  </g>
)

const IconSnow = () => (
  <g>
    <CloudShape />
    <Snowflake cx="26" cy="56" />
    <Snowflake cx="36" cy="58" />
    <Snowflake cx="46" cy="56" />
  </g>
)

const IconThunder = () => (
  <g>
    <CloudShape />
    <path d="M36 48h8l-10 16 2-10h-8l10-16-2 10z" />
  </g>
)

const ICONS = {
  'clear-day': IconClearDay,
  'clear-night': IconClearNight,
  'partly-day': IconPartlyDay,
  'partly-night': IconPartlyNight,
  cloudy: IconCloudy,
  fog: IconFog,
  rain: IconRain,
  snow: IconSnow,
  thunder: IconThunder,
}

export default function WeatherIcon({ weatherCode, isDay, text, className = '', style = {} }) {
  const key = resolveWeatherIconKey({ weatherCode, isDay, text })
  const Icon = ICONS[key] || IconCloudy

  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox={VIEWBOX}
      aria-hidden="true"
      fill="currentColor"
      style={{ verticalAlign: '-0.15em', overflow: 'hidden', ...style }}
      focusable="false"
    >
      <Icon />
    </svg>
  )
}
