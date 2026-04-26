import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { TabBar } from 'antd-mobile'
import Icon from '@/components/Icon'
import styles from './index.module.less'

const TAB_KEYS = new Set(['/home', '/outfit', '/match', '/person', '/unified-agent'])

const AgentAvatar = ({ active }) => (
    <span className={`${styles['agent-btn']} ${active ? styles['agent-btn--active'] : styles['agent-btn--inactive']}`}>
        <svg viewBox="0 0 60 60" fill="none" className={styles['agent-avatar-svg']}>
            <rect width="60" height="60" rx="30" fill={active ? '#18142A' : '#6B6B7A'} />
            <polygon points="30,12 44,36 16,36" fill="none" stroke={active ? '#A855F7' : '#C4C4CE'} strokeWidth="2.5" opacity="0.95" />
            <polygon points="30,48 16,24 44,24" fill="none" stroke={active ? '#7C3AED' : '#B5B5BF'} strokeWidth="2.5" opacity="0.95" />
            <circle cx="30" cy="30" r="8" fill="none" stroke={active ? '#C084FC' : '#D0D0D8'} strokeWidth="2" opacity="0.85" />
            <circle cx="30" cy="30" r="3" fill={active ? '#A855F7' : '#B8B8C0'} />
        </svg>
    </span>
)

const tabs = [
    {
        key: '/home',
        title: '衣序',
        icon: <Icon type='iconfont icon-shouye1' />
    },
    {
        key: '/outfit',
        title: '衣藏',
        icon: <Icon type='iconfont icon-tubiao-' />
    },
    {
        key: '/unified-agent',
        title: '',
        center: true
    },
    {
        key: '/match',
        title: '衣织',
        icon: <Icon type='iconfont icon-magic' />
    },
    {
        key: '/person',
        title: '衣笺',
        icon: <Icon type='iconfont icon-icon-myself-1' />
    }
]

export default function BottomNavigation({ onHiddenChange }) {
    const navigate = useNavigate()
    const location = useLocation()
    const { pathname } = location
    const [isHidden, setIsHidden] = useState(false)
    const previousActiveKeyRef = useRef('')

    const activeKey = React.useMemo(() => {
        if (pathname.startsWith('/match')) return '/match'
        if (pathname.startsWith('/recommend')) return '/match'
        if (pathname.startsWith('/suits')) return '/match'
        if (pathname.startsWith('/outfit')) return '/outfit'
        if (pathname.startsWith('/home')) return '/home'
        if (pathname.startsWith('/person')) return '/person'
        if (pathname.startsWith('/unified-agent') || pathname.startsWith('/agent')) return '/unified-agent'
        if (pathname.startsWith('/aichat')) return '/unified-agent'
        return pathname
    }, [pathname])

    const isInactive = !TAB_KEYS.has(activeKey)

    useEffect(() => {
        if (previousActiveKeyRef.current && previousActiveKeyRef.current !== activeKey && isHidden && TAB_KEYS.has(activeKey)) {
            setIsHidden(false)
            onHiddenChange?.(false)
        }
        previousActiveKeyRef.current = activeKey
    }, [activeKey, isHidden, onHiddenChange])

    const handleHide = useCallback(() => {
        setIsHidden(true)
        onHiddenChange?.(true)
    }, [onHiddenChange])

    const handleShow = useCallback(() => {
        setIsHidden(false)
        onHiddenChange?.(false)
    }, [onHiddenChange])

    return (
        <>
            {isHidden && (
                <button
                    className={styles['restore-indicator']}
                    onClick={handleShow}
                    aria-label="显示导航栏"
                    type="button"
                >
                    <span className={styles['restore-pill']} />
                </button>
            )}
            <div className={`${styles['bottom-navigation-bar']} ${isInactive ? styles.inactive : ''} ${isHidden ? styles.hidden : ''}`}>
                {!isHidden && (
                    <button
                        className={styles['hide-handle']}
                        onClick={handleHide}
                        aria-label="隐藏导航栏"
                        type="button"
                    >
                        <span className={styles['hide-pill']} />
                    </button>
                )}
                <TabBar
                    onChange={key => {
                        navigate(key)
                    }}
                    activeKey={activeKey}
                >
                    {
                        tabs.map(item => (
                            <TabBar.Item
                                key={item.key}
                                icon={item.center ? <AgentAvatar active={activeKey === item.key} /> : item.icon}
                                title={item.title}
                                className={item.center ? styles['center-tab'] : undefined}
                            />
                        ))
                    }
                </TabBar>
            </div>
        </>
    )
}
