import styles from './index.module.less'
import SvgIcon from '@/components/SvgIcon'
import test from '@/assets/test.jpg'
import { useState, useEffect } from 'react'

export default function Home() {
  const [labelColors, setLabelColors] = useState([])

  // 生成随机颜色的函数
  const generateRandomColor = () => {
    const colors = [
      { bg: '#FFE4E1', text: '#8B0000' }, // 浅粉红 + 深红
      { bg: '#E6F3FF', text: '#0066CC' }, // 浅蓝 + 深蓝
      { bg: '#F0FFF0', text: '#006400' }, // 浅绿 + 深绿
      { bg: '#FFF8DC', text: '#B8860B' }, // 浅黄 + 深黄
      { bg: '#F5F0FF', text: '#6A0DAD' }, // 浅紫 + 深紫
      { bg: '#FFE4B5', text: '#FF8C00' }, // 浅橙 + 深橙
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  // 组件挂载时生成随机颜色
  useEffect(() => {
    setLabelColors([
      generateRandomColor(),
      generateRandomColor(),
      generateRandomColor(),
      generateRandomColor()
    ])
  }, [])

  // useEffect(() => {
  //   // 发送测试请求
  //   axios.post('/user/test').then(res => {
  //     console.log('请求成功:', res);
  //   }).catch(err => {
  //     console.error('请求失败:', err);
  //   })
  // }, [])

  return (
    <div className={styles.home}>
      <div className={styles.header}>
        <div className={styles['header-title']}>首页</div>
        <div className={styles['header-weather']}>
          <SvgIcon iconName='icon-qingtian' className={styles['weather-icon']}/>
          25℃
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles['content-title']}>
          今日场景适配穿搭
        </div>

        <div className={styles.container}>

          <div className={styles['container-item']}>
            <div className={styles['item-img']}>
              <img src={test} alt="" />
            </div>
            <div className={styles['item-label']}>
              <div 
                className={styles.label}
                style={{
                  backgroundColor: labelColors[0]?.bg || '#f5f5f5',
                  color: labelColors[0]?.text || '#333'
                }}
              >
                今日通勤
              </div>
              <div 
                className={styles.label}
                style={{
                  backgroundColor: labelColors[1]?.bg || '#f5f5f5',
                  color: labelColors[1]?.text || '#333'
                }}
              >
                商务正式
              </div>
            </div>
            <div className={styles['item-message']}>
              根据你的衣柜和今日行程，为你推荐这套商务通勤装扮，适
              合参加重要会议场合
            </div>
          </div>

          <div className={styles['container-item']}>
            <div className={styles['item-img']}>
              <img src={test} alt="" />
            </div>
            <div className={styles['item-label']}>
              <div 
                className={styles.label}
                style={{
                  backgroundColor: labelColors[2]?.bg || '#f5f5f5',
                  color: labelColors[2]?.text || '#333'
                }}
              >
                休闲约会
              </div>
              <div 
                className={styles.label}
                style={{
                  backgroundColor: labelColors[3]?.bg || '#f5f5f5',
                  color: labelColors[3]?.text || '#333'
                }}
              >
                舒适文艺
              </div>
            </div>
            <div className={styles['item-message']}>
              下午的咖啡约会，这套轻松休闲的搭配让你展现优雅知性的
              一面
            </div>
          </div>
        </div>

      </div>

    </div>
  )
}
