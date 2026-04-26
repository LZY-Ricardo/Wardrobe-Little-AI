import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import AgentFloatingBubble from '@/components/AgentFloatingBubble'
import BottomNavigation from '@/components/BottomNavigation'
import styles from './index.module.less'

export default function Layout({children, showBottomNav = true}) {
    const [navHidden, setNavHidden] = useState(false)
    const location = useLocation()
    const shouldShowBubble = !location.pathname.startsWith('/unified-agent') && !location.pathname.startsWith('/aichat')
    const bubbleBottomInset = showBottomNav && !navHidden ? 92 : 18

    return (
        <div className={`${styles['layout']} ${navHidden ? styles['layout--nav-hidden'] : ''}`}>
            <div className={styles['layout-content']}>
                {children}
            </div>
            {shouldShowBubble ? <AgentFloatingBubble bottomInset={bubbleBottomInset} /> : null}
            {showBottomNav && <BottomNavigation onHiddenChange={setNavHidden} />}
        </div>
    )
}
