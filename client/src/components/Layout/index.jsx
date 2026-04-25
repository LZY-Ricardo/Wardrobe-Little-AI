import React, { useState } from 'react'
import BottomNavigation from '@/components/BottomNavigation'
import styles from './index.module.less'

export default function Layout({children, showBottomNav = true}) {
    const [navHidden, setNavHidden] = useState(false)

    return (
        <div className={`${styles['layout']} ${navHidden ? styles['layout--nav-hidden'] : ''}`}>
            <div className={styles['layout-content']}>
                {children}
            </div>
            {showBottomNav && <BottomNavigation onHiddenChange={setNavHidden} />}
        </div>
    )
}
