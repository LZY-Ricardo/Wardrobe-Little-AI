import React from 'react'
import BottomNavigation from '@/components/BottomNavigation'
import styles from './index.module.less'

export default function Layout({children, showBottomNav = true}) {
    return (
        <div className={styles['layout']}>
            <div className={styles['layout-content']}>
                {children}
            </div>
            {showBottomNav && <BottomNavigation />}
        </div>
    )
}
