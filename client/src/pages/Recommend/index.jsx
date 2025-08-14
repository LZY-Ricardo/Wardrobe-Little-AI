import React from 'react'
import styles from './index.module.less'
import SvgIcon from '@/components/SvgIcon'


export default function Recommend() {
  return (
    <div className={styles['recommend']}>
      <div className={styles['recommend-header']}>
        <SvgIcon iconName="icon-icon-sousuo" className={styles['search-icon']}/>
        <input type="text" placeholder="请输入场景(如约会、运动)" />  
        <button>确认</button>
      </div>
    </div>
  )
}

