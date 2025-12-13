import { useEffect, useMemo, useState } from 'react'
import axios from '@/api'
import SvgIcon from '@/components/SvgIcon'
import DarkModeToggle from '@/components/DarkModeToggle'
import { Loading, Empty, ErrorBanner } from '@/components/Feedback'
import styles from './index.module.less'
import { defaultWeather, defaultTags } from '@/config/homeConfig'

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

const generateRandomColor = () => {
  const colors = [
    { bg: '#FFE4E1', text: '#8B0000' },
    { bg: '#E6F3FF', text: '#0066CC' },
    { bg: '#F0FFF0', text: '#006400' },
    { bg: '#FFF8DC', text: '#B8860B' },
    { bg: '#F5F0FF', text: '#6A0DAD' },
    { bg: '#FFE4B5', text: '#FF8C00' },
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

export default function Home() {
  const [labelColors, setLabelColors] = useState([])
  const [clothesData, setClothesData] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [weather, setWeather] = useState(defaultWeather)
  const [tags, setTags] = useState(defaultTags)

  const randomClothes = useMemo(() => {
    if (!clothesData?.length) return []
    const shuffled = [...clothesData].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, 3)
  }, [clothesData])

  useEffect(() => {
    setLabelColors([generateRandomColor(), generateRandomColor(), generateRandomColor(), generateRandomColor()])
  }, [])

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
          if (res.data.tags?.length) {
            setTags(res.data.tags)
          }
        }
      } catch (err) {
        console.warn('天气接口不可用，使用兜底数据', err)
        setWeather(defaultWeather)
        setTags(defaultTags)
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

    const shouldRequestGeo = !cached?.asked && isGeoSupported() && isSecureGeoContext()
    if (shouldRequestGeo) {
      writeSessionJson(WEATHER_GEO_CACHE_KEY, { asked: true, coords: cachedCoords, at: Date.now() })
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }
          writeSessionJson(WEATHER_GEO_CACHE_KEY, { asked: true, coords, at: Date.now() })
          fetchWeather(coords)
        },
        (geoError) => {
          console.warn('获取定位失败，使用默认天气', geoError)
          writeSessionJson(WEATHER_GEO_CACHE_KEY, { asked: true, coords: null, at: Date.now() })
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 10 * 60 * 1000,
        }
      )
    }
  }, [])

  const renderClothes = () => {
    if (status === 'loading') return <Loading text="加载衣物中..." />
    if (status === 'error') return <ErrorBanner message={error} onAction={() => window.location.reload()} />
    if (!randomClothes.length) return <Empty description="暂无衣物，去添加一件吧" actionText="添加" onAction={() => window.location.href = '/add'} />

    return (
      <div className={styles.container}>
        {randomClothes.map((item, index) => (
          <div className={styles['container-item']} key={item.cloth_id || index}>
            <div className={styles['item-img']}>
              <img src={item.image} alt={item.name} />
            </div>
            <div className={styles['item-label']}>
              <div
                className={styles.label}
                style={{
                  backgroundColor: labelColors[0]?.bg || '#f5f5f5',
                  color: labelColors[0]?.text || '#333',
                }}
              >
                {item.type}
              </div>
              <div
                className={styles.label}
                style={{
                  backgroundColor: labelColors[1]?.bg || '#f5f5f5',
                  color: labelColors[1]?.text || '#333',
                }}
              >
                {item.style}
              </div>
            </div>
            <div className={styles['item-message']}>{item.name}</div>
          </div>
        ))}
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
        <div className={styles['content-title']}>精选衣物展示</div>

        <div className={styles['tag-list']}>
          {tags.map((tag) => (
            <span key={tag} className={styles['tag-chip']}>
              {tag}
            </span>
          ))}
        </div>

        {renderClothes()}
      </div>
    </div>
  )
}
