import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Match from '@/pages/Match'
import Recommend from '@/pages/Recommend'
import Suits from '@/pages/Suits'
import styles from './index.module.less'

const TABS = [
  { key: 'preview', title: '衣映' },
  { key: 'recommend', title: '衣境' },
  { key: 'collection', title: '衣萃' },
]

const parseTabKey = (search = '') => {
  const params = new URLSearchParams(search || '')
  const value = (params.get('tab') || '').trim().toLowerCase()
  if (TABS.some((t) => t.key === value)) return value
  return 'preview'
}

const setTabKey = (search = '', nextKey = 'preview') => {
  const params = new URLSearchParams(search || '')
  params.set('tab', nextKey)
  return `?${params.toString()}`
}

export default function MatchHub() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeKey = parseTabKey(location.search)

  const handleTabClick = (key) => {
    if (key === activeKey) return
    navigate({ pathname: '/match', search: setTabKey(location.search, key) }, { replace: true })
  }

  const renderBody = () => {
    if (activeKey === 'recommend') return <Recommend embedded />
    if (activeKey === 'collection') return <Suits embedded />
    return <Match embedded />
  }

  return (
    <div className={styles.hub}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tab} ${tab.key === activeKey ? styles.tabActive : ''}`}
              onClick={() => handleTabClick(tab.key)}
            >
              {tab.title}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.body}>{renderBody()}</div>
    </div>
  )
}

