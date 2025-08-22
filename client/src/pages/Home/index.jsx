import styles from './index.module.less'
import SvgIcon from '@/components/SvgIcon'
import DarkModeToggle from '@/components/DarkModeToggle'
import { useState, useEffect } from 'react'
import axios from '@/api'

export default function Home() {
  const [labelColors, setLabelColors] = useState([])
  const [clothesData, setClothesData] = useState([])
  const [randomClothes, setRandomClothes] = useState([])

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

  // 获取全部衣物数据
  const getClothesData = async () => {
    const res = await axios.get('/clothes/all')
    setClothesData(res.data)
  }

  // 获取随机衣物数据
  const getRandomClothes = (data) => {
    if (!data || data.length === 0) return [];

    // 随机打乱数组
    const shuffled = [...data].sort(() => 0.5 - Math.random());
    // 返回前3个作为展示
    return shuffled.slice(0, 3);
  }

  // 组件挂载时生成随机颜色和获取衣物数据
  useEffect(() => {
    setLabelColors([
      generateRandomColor(),
      generateRandomColor(),
      generateRandomColor(),
      generateRandomColor()
    ])
    getClothesData()
  }, [])

  // 监听clothesData变化，随机选取衣物
  useEffect(() => {
    if (clothesData.length > 0) {
      const randomClothes = getRandomClothes(clothesData);
      // 这里可以更新状态用于展示随机衣物
      setRandomClothes(randomClothes)
    }
  }, [clothesData])

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
          <SvgIcon iconName='icon-qingtian' className={styles['weather-icon']} />
          25℃
        </div>
        <div className={styles['header-actions']}>
          <DarkModeToggle />
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles['content-title']}>
          精美衣物展示
        </div>

        <div className={styles.container}>

          {
            randomClothes.map((item, index) => (
              <div className={styles['container-item']} key={index}>
                <div className={styles['item-img']}>
                  <img src={item.image} alt="" />
                </div>
                <div className={styles['item-label']}>
                  <div
                    className={styles.label}
                    style={{
                      backgroundColor: labelColors[0]?.bg || '#f5f5f5',
                      color: labelColors[0]?.text || '#333'
                    }}
                  >
                    {item.type}
                  </div>
                  <div
                    className={styles.label}
                    style={{
                      backgroundColor: labelColors[1]?.bg || '#f5f5f5',
                      color: labelColors[1]?.text || '#333'
                    }}
                  >
                    {item.style}
                  </div>
                </div>
                <div className={styles['item-message']}>
                  {item.name}
                </div>
              </div>
            ))
          }
        </div>

      </div>

    </div>
  )
}
