import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from '@/api'
import SvgIcon from '@/components/SvgIcon'
import Icon from '@/components/Icon'
import DarkModeToggle from '@/components/DarkModeToggle'
import { Loading, Empty, ErrorBanner } from '@/components/Feedback'
import styles from './index.module.less'
import { defaultWeather } from '@/config/homeConfig'

const WEATHER_GEO_CACHE_KEY = 'weather_geo_cache_v1'

const readSessionJson = (key) => {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writeSessionJson = (key, value) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

const isGeoSupported = () => typeof navigator !== 'undefined' && Boolean(navigator.geolocation)

const isSecureGeoContext = () => {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true
  const host = window.location?.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

const getGeoPermissionState = async () => {
  try {
    if (!navigator?.permissions?.query) return 'unknown'
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status?.state || 'unknown'
  } catch {
    return 'unknown'
  }
}

const logWeatherGeo = (...args) => {
  console.log(...args)
}

const parseTempValue = (temp) => {
  const match = String(temp || '').match(/-?\d+/)
  if (!match) return null
  const value = Number(match[0])
  return Number.isFinite(value) ? value : null
}

const buildAdviceText = (tempValue, weatherText) => {
  const desc = String(weatherText || '')
  const tips = []

  if (typeof tempValue === 'number') {
    if (tempValue <= 5) tips.push('天气偏冷：厚外套 + 保暖内搭 + 长裤更稳妥。')
    else if (tempValue <= 12) tips.push('有点冷：外套/卫衣 + 长裤，注意保暖。')
    else if (tempValue <= 20) tips.push('体感舒适：长袖或薄外套，早晚可叠穿。')
    else if (tempValue <= 27) tips.push('偏暖：短袖/薄衬衫 + 轻薄下装即可。')
    else tips.push('天气较热：清爽面料（棉/亚麻）+ 透气鞋更舒适。')
  } else {
    tips.push('根据体感选择叠穿层次，更容易适应室内外温差。')
  }

  if (desc.includes('雨')) tips.push('有降雨概率：记得带伞，优先防水/易打理材质。')
  if (desc.includes('雪')) tips.push('可能有降雪：鞋底防滑更重要。')
  if (desc.includes('风')) tips.push('风较大：外套选择防风面料，围巾可加分。')

  return tips.join(' ')
}

const buildAdviceTags = (tempValue, weatherText) => {
  const tags = []
  const desc = String(weatherText || '')

  if (typeof tempValue === 'number') {
    if (tempValue <= 12) tags.push('保暖')
    if (tempValue >= 28) tags.push('清凉')
    if (tempValue >= 20 && tempValue < 28) tags.push('舒适')
    if (tempValue >= 13 && tempValue <= 20) tags.push('叠穿')
  }

  if (desc.includes('雨')) tags.push('带伞')
  if (desc.includes('风')) tags.push('防风')
  if (desc.includes('雪')) tags.push('防滑')

  return Array.from(new Set(tags)).slice(0, 4)
}

export default function Home() {
  const navigate = useNavigate()
  const [clothesData, setClothesData] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [weather, setWeather] = useState(defaultWeather)

  const closetStats = useMemo(() => {
    const list = Array.isArray(clothesData) ? clothesData : []
    const includesType = (keyword) => list.filter((item) => item?.type?.includes(keyword)).length

    return {
      total: list.length,
      top: includesType('上衣'),
      bottom: includesType('下衣'),
      shoes: includesType('鞋子'),
      accessory: includesType('配饰'),
      favorite: list.filter((item) => Boolean(item?.favorite)).length,
    }
  }, [clothesData])

  const tempValue = useMemo(() => parseTempValue(weather?.temp), [weather?.temp])
  const adviceText = useMemo(() => buildAdviceText(tempValue, weather?.text), [tempValue, weather?.text])
  const adviceTags = useMemo(() => buildAdviceTags(tempValue, weather?.text), [tempValue, weather?.text])

  useEffect(() => {
    const fetchClothes = async () => {
      setStatus('loading')
      setError('')
      try {
        const res = await axios.get('/clothes/all')
        setClothesData(res?.data || [])
        setStatus('success')
      } catch (err) {
        console.error('获取衣物数据失败', err)
        setStatus('error')
        setError('获取衣物数据失败，请重试')
      }
    }

    const fetchWeather = async (coords) => {
      try {
        const res = coords
          ? await axios.get('/weather/today', {
              params: {
                lat: coords.latitude,
                lon: coords.longitude,
              },
            })
          : await axios.get('/weather/today')
        if (res?.data) {
          setWeather({
            city: res.data.city || defaultWeather.city,
            temp: res.data.temp || defaultWeather.temp,
            text: res.data.text || defaultWeather.text,
          })
        }
        return res?.data || null
      } catch (err) {
        console.warn('天气接口不可用，使用兜底数据', err)
        setWeather(defaultWeather)
        return null
      }
    }

    fetchClothes()

    const cached = readSessionJson(WEATHER_GEO_CACHE_KEY)
    const cachedCoords =
      Number.isFinite(cached?.coords?.latitude) && Number.isFinite(cached?.coords?.longitude)
        ? cached.coords
        : null

    if (cachedCoords) {
      fetchWeather(cachedCoords)
    } else {
      fetchWeather()
    }

    const requestGeo = async () => {
      if (cachedCoords) return
      if (!isGeoSupported() || !isSecureGeoContext()) return

      const permissionState = await getGeoPermissionState()
      logWeatherGeo('[weather] 定位请求已触发', { permissionState })
      const askedAt =
        typeof cached?.askedAt === 'number' ? cached.askedAt : cached?.asked ? Date.now() : 0

      if (permissionState === 'denied') {
        writeSessionJson(WEATHER_GEO_CACHE_KEY, {
          askedAt: askedAt || Date.now(),
          coords: null,
          coordsAt: null,
          lastErrorCode: 1,
          lastErrorAt: Date.now(),
        })
        return
      }

      const shouldRequest = permissionState === 'granted' || !askedAt
      if (!shouldRequest) return

      const nextAskedAt = askedAt || Date.now()
      writeSessionJson(WEATHER_GEO_CACHE_KEY, {
        askedAt: nextAskedAt,
        coords: null,
        coordsAt: null,
        lastErrorCode: null,
        lastErrorAt: null,
      })

      const maximumAge = 10 * 60 * 1000
      const primaryTimeout = permissionState === 'prompt' || permissionState === 'unknown' ? 30000 : 15000
      let retried = false

      const onSuccess = (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }
        logWeatherGeo('[weather] 定位成功', coords)
        writeSessionJson(WEATHER_GEO_CACHE_KEY, {
          askedAt: nextAskedAt,
          coords,
          coordsAt: Date.now(),
          lastErrorCode: null,
          lastErrorAt: null,
        })
        void fetchWeather(coords).then((weatherData) => {
          if (weatherData) {
            logWeatherGeo('[weather] 天气已刷新', {
              city: weatherData.city,
              temp: weatherData.temp,
              text: weatherData.text,
            })
          } else {
            logWeatherGeo('[weather] 定位成功，但天气刷新失败（已使用默认天气）')
          }
        })
      }

      const onError = (geoError) => {
        logWeatherGeo('[weather] 定位失败', { code: geoError?.code, message: geoError?.message })
        writeSessionJson(WEATHER_GEO_CACHE_KEY, {
          askedAt: nextAskedAt,
          coords: null,
          coordsAt: null,
          lastErrorCode: geoError?.code ?? null,
          lastErrorAt: Date.now(),
        })

        if (!retried && geoError?.code === 3) {
          retried = true
          navigator.geolocation.getCurrentPosition(
            onSuccess,
            (finalError) => {
              logWeatherGeo('[weather] 定位重试失败', { code: finalError?.code, message: finalError?.message })
              writeSessionJson(WEATHER_GEO_CACHE_KEY, {
                askedAt: nextAskedAt,
                coords: null,
                coordsAt: null,
                lastErrorCode: finalError?.code ?? null,
                lastErrorAt: Date.now(),
              })
            },
            {
              enableHighAccuracy: false,
              timeout: 30000,
              maximumAge,
            }
          )
        }
      }

      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: false,
        timeout: primaryTimeout,
        maximumAge,
      })
    }

    void requestGeo()
  }, [])

  const quickEntries = useMemo(
    () => [
      {
        key: 'outfit',
        title: '虚拟衣柜',
        desc: '管理/筛选/搜索衣物',
        to: '/outfit',
        icon: <Icon type="iconfont icon-tubiao-" className={styles['entry-icon']} />,
      },
      {
        key: 'match',
        title: '搭配中心',
        desc: '选上衣+下衣生成预览',
        to: '/match',
        icon: <Icon type="iconfont icon-magic" className={styles['entry-icon']} />,
      },
      {
        key: 'recommend',
        title: '场景推荐',
        desc: '通勤/约会/运动…',
        to: '/recommend',
        icon: <Icon type="iconfont icon-dengpao" className={styles['entry-icon']} />,
      },
      {
        key: 'add',
        title: '添加衣物',
        desc: '上传图片自动识别',
        to: '/add',
        icon: <SvgIcon iconName="icon-jiahao-copy" className={styles['entry-icon']} />,
      },
      {
        key: 'person',
        title: '我的',
        desc: '资料/人物模特设置',
        to: '/person',
        icon: <Icon type="iconfont icon-icon-myself-1" className={styles['entry-icon']} />,
      },
      {
        key: 'aichat',
        title: 'AI 助手',
        desc: '穿搭问答/使用指导',
        to: '/aichat',
        icon: <SvgIcon iconName="icon-zhinengkefu" className={styles['entry-icon']} />,
      },
    ],
    []
  )

  const sceneShortcuts = useMemo(() => ['通勤', '约会', '运动', '旅行'], [])

  const renderClosetOverview = () => {
    if (status === 'loading') return <Loading text="加载衣橱概览..." />
    if (status === 'error') return <ErrorBanner message={error} onAction={() => window.location.reload()} />
    if (!clothesData?.length) {
      return (
        <Empty
          description="你的衣橱还是空的，先添加一件衣物吧"
          actionText="去添加"
          onAction={() => navigate('/add')}
        />
      )
    }

    return (
      <div className={styles['overview-card']}>
        <div className={styles['stats-row']}>
          <div className={styles['stat-item']}>
            <div className={styles['stat-label']}>衣物总数</div>
            <div className={styles['stat-value']}>{closetStats.total}</div>
          </div>
          <div className={styles['stat-item']}>
            <div className={styles['stat-label']}>已收藏</div>
            <div className={styles['stat-value']}>{closetStats.favorite}</div>
          </div>
        </div>

        <div className={styles['category-row']}>
          <span className={styles['category-chip']}>上衣 {closetStats.top}</span>
          <span className={styles['category-chip']}>下衣 {closetStats.bottom}</span>
          <span className={styles['category-chip']}>鞋子 {closetStats.shoes}</span>
          <span className={styles['category-chip']}>配饰 {closetStats.accessory}</span>
        </div>

        <div className={styles['overview-actions']}>
          <button type="button" className={styles['link-btn']} onClick={() => navigate('/outfit')}>
            去管理衣橱
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.home}>
      <div className={styles.header}>
        <div className={styles['header-title']}>首页</div>
        <div className={styles['header-weather']}>
          <SvgIcon iconName="icon-qingtian" className={styles['weather-icon']} />
          {weather.city} · {weather.temp} · {weather.text}
        </div>
        <div className={styles['header-actions']}>
          <DarkModeToggle />
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles['today-card']}>
          <div className={styles['today-top']}>
            <div>
              <div className={styles['today-title']}>今日建议</div>
              <div className={styles['today-subtitle']}>
                {weather.city} · {weather.temp} · {weather.text}
              </div>
            </div>
            <div className={styles['today-tags']}>
              {adviceTags.map((tag) => (
                <span key={tag} className={styles['today-tag']}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className={styles['today-desc']}>{adviceText}</div>

          <div className={styles['today-scenes']}>
            {sceneShortcuts.map((scene) => (
              <button
                key={scene}
                type="button"
                className={styles['scene-chip']}
                onClick={() => navigate('/recommend', { state: { presetScene: scene } })}
              >
                {scene}
              </button>
            ))}
          </div>

          <div className={styles['today-actions']}>
            <button
              type="button"
              className={styles['btn-primary']}
              onClick={() => (clothesData?.length ? navigate('/recommend') : navigate('/add'))}
            >
              {clothesData?.length ? '去场景推荐' : '去添加衣物'}
            </button>
            <button type="button" className={styles['btn-secondary']} onClick={() => navigate('/match')}>
              去搭配中心
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles['section-title']}>快捷入口</div>
          <div className={styles['entry-grid']}>
            {quickEntries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={styles['entry-item']}
                onClick={() => navigate(entry.to)}
              >
                <div className={styles['entry-icon-wrap']}>{entry.icon}</div>
                <div className={styles['entry-text']}>
                  <div className={styles['entry-title']}>{entry.title}</div>
                  <div className={styles['entry-desc']}>{entry.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles['section-title']}>衣橱概览</div>
          {renderClosetOverview()}
        </div>
      </div>
    </div>
  )
}
