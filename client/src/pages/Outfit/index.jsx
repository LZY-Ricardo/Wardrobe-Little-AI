import React, { useState, useEffect } from 'react'
import SvgIcon from '@/components/SvgIcon'
import white from '@/assets/white.jpg'
import styles from './index.module.less'
import { useNavigate } from 'react-router-dom'


// 生成随机颜色的函数
const generateRandomColor = () => {
  const colors = [
    { bg: '#FFE4E1', text: '#8B0000' }, // 浅粉红 + 深红
    { bg: '#E6F3FF', text: '#0066CC' }, // 浅蓝 + 深蓝
    { bg: '#F0FFF0', text: '#006400' }, // 浅绿 + 深绿
    { bg: '#FFF8DC', text: '#B8860B' }, // 浅黄 + 深黄
    { bg: '#F5F0FF', text: '#6A0DAD' }, // 浅紫 + 深紫
    { bg: '#FFE4B5', text: '#FF8C00' }, // 浅橙 + 深橙
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

export default function outfit() {
  const [labelColors, setLabelColors] = useState([]);
  const navigate = useNavigate()


  useEffect(() => {
    const colors = []
    for (let i = 0; i < 10; i++) {
      colors.push(generateRandomColor())
    }
    setLabelColors(colors)
  }, [])

  return (
    <div className={styles.outfit}>

      <div className={styles.header}>
        <div className={styles['header-left']}>我的衣柜</div>
        <div className={styles['header-right']} onClick={() => navigate('/add')}>

          <SvgIcon iconName='icon-jiahao-copy' />
        </div>
      </div>

      <div className={styles.container}>
        <div className={styles.select}>
          <div className={styles['select-type']}>
            <div className={styles['type-title']}>全部</div>
            <div className={styles['type-item']}>上衣</div>
            <div className={styles['type-item']}>鞋子</div>
            <div className={styles['type-item']}>裤子</div>
          </div>
          <div className={styles['select-color']}>
            <div className={styles['color-title']}>全部</div>
            <div className={styles['color-item']}>白色</div>
            <div className={styles['color-item']}>黑色</div>
            <div className={styles['color-item']}>红色</div>
          </div>
          <div className={styles['select-season']}>
            <div className={styles['season-title']}>全部</div>
            <div className={styles['season-item']}>春天</div>
            <div className={styles['season-item']}>夏天</div>
            <div className={styles['season-item']}>秋天</div>
            <div className={styles['season-item']}>冬天</div>
          </div>
          <div className={styles['select-style']}>
            <div className={styles['style-title']}>全部</div>
            <div className={styles['style-item']}>休闲</div>
            <div className={styles['style-item']}>通勤</div>
            <div className={styles['style-item']}>运动</div>
          </div>
        </div>
        <div className={styles.clothes}>
          <div className={styles['clothes-item']}>
            <div className={styles['clothes-img']}>
              <img src={white} alt="" />
            </div>
            <div className={styles.label}>
              <div className={styles['label-item']}>
                白色短袖
              </div>
              <div className={styles['label-item']}>
                通勤
              </div>
              <div className={styles['label-item']}>
                春秋
              </div>
            </div>
          </div>
          <div className={styles['clothes-item']}>
            <div className={styles['clothes-img']}>
              <img src={white} alt="" />
            </div>
            <div className={styles.label}>
              <div className={styles['label-item']}>
                白色短袖
              </div>
              <div className={styles['label-item']}>
                通勤
              </div>
              <div className={styles['label-item']}>
                春秋
              </div>
            </div>
          </div>
          <div className={styles['clothes-item']}>
            <div className={styles['clothes-img']}>
              <img src={white} alt="" />
            </div>
            <div className={styles.label}>
              <div className={styles['label-item']}>
                白色短袖
              </div>
              <div className={styles['label-item']}>
                通勤
              </div>
              <div className={styles['label-item']}>
                春秋
              </div>
            </div>
          </div>
          <div className={styles['clothes-item']}>
            <div className={styles['clothes-img']}>
              <img src={white} alt="" />
            </div>
            <div className={styles.label}>
              <div className={styles['label-item']}>
                白色短袖
              </div>
              <div className={styles['label-item']}>
                通勤
              </div>
              <div className={styles['label-item']}>
                春秋
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
