import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { TabBar } from 'antd-mobile'
import AiChatEntrance from '@/components/AiChatEntrance'
import Icon from '@/components/Icon'
import styles from './index.module.less'

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

export default function BottomNavigation() {
    const navigate = useNavigate()
    const location = useLocation()
    const { pathname } = location

    const activeKey = React.useMemo(() => {
        if (pathname.startsWith('/match')) return '/match'
        if (pathname.startsWith('/recommend')) return '/match'
        if (pathname.startsWith('/suits')) return '/match'
        if (pathname.startsWith('/outfit')) return '/outfit'
        if (pathname.startsWith('/home')) return '/home'
        if (pathname.startsWith('/person')) return '/person'
        return pathname
    }, [pathname])

    return (
        <div className={styles['bottom-navigation-bar']}>
            <AiChatEntrance />
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
                            icon={item.icon}
                            title={item.title}
                        />
                    ))
                }
            </TabBar>
        </div>
    )
}
