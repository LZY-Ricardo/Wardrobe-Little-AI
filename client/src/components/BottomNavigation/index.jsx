import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { TabBar } from 'antd-mobile'
import AiChatEntrance from '@/components/AiChatEntrance'
import Icon from '@/components/Icon'
import styles from './index.module.less'

const tabs = [
    {
        key: '/home',
        title: '首页',
        icon: <Icon type='iconfont icon-shouye1' />
    },
    {
        key: '/outfit',
        title: '虚拟衣柜',
        icon: <Icon type='iconfont icon-tubiao-' />
    },
    {
        key: '/match',
        title: '搭配中心',
        icon: <Icon type='iconfont icon-magic' />
    },
    {
        key: '/recommend',
        title: '场景推荐',
        icon: <Icon type='iconfont icon-dengpao' />
    },
    {
        key: '/person',
        title: '我的',
        icon: <Icon type='iconfont icon-icon-myself-1' />
    }
]

export default function BottomNavigation() {
    const navigate = useNavigate()
    const location = useLocation()
    const { pathname } = location

    return (
        <div className={styles['bottom-navigation-bar']}>
            <AiChatEntrance />
            <TabBar
                onChange={key => {
                    navigate(key)
                }}
                activeKey={pathname}
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
