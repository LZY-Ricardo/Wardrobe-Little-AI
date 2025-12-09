import React, { useState } from 'react'
import styles from './index.module.less'
import SvgIcon from '@/components/SvgIcon'
import { useNavigate } from 'react-router-dom'
import { Button, Toast } from 'antd-mobile'
import axios from '@/api'

const normalizeSuits = (data = [], fallbackScene = '') => {
  if (!Array.isArray(data)) return []
  return data.map((item, index) => ({
    id: item.id ?? index,
    scene: item.scene || item.sceneName || fallbackScene || '通用场景',
    description: item.message || item.description || item.desc || 'AI 推荐搭配',
    items: item.items || item.suits || item.clothes || [],
    cover: item.image || item.cover || '',
  }))
}

export default function Recommend() {
  const [scene, setScene] = useState('')
  const [sceneSuits, setSceneSuits] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [serviceUnavailable, setServiceUnavailable] = useState(false)
  const navigate = useNavigate()

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
      const list = normalizeSuits(res?.data, value)
      setSceneSuits(list)
      if (!list.length) {
        setError('暂无推荐结果，换个场景试试')
      }
    } catch (err) {
      const message = err?.data?.msg || err?.response?.data?.msg || '推荐服务不可用，请稍后重试'
      setError(message)
      setSceneSuits([])
      setServiceUnavailable(true)
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
            <div className={styles['item-message']}>{item.description}</div>
            <div className={styles['item-scene']}>{item.scene}</div>
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
      <div className={styles['chat']} onClick={() => navigate('/aichat')}>
        <SvgIcon iconName="icon-zhinengkefu" className={styles['chat-icon']} />
        <p>AI 助手</p>
      </div>

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

