import React, { useEffect, useState } from 'react'
import styles from './index.module.less'
import SvgIcon from '@/components/SvgIcon'
import first from '@/assets/1.png'
import second from '@/assets/22.png'
import third from '@/assets/333.png'
import { useNavigate } from 'react-router-dom'
import { Toast } from 'antd-mobile'
import axios from '@/api'

export default function Recommend() {
  const [scene, setScene] = useState('')
  const [sceneSuits, setSceneSuits] = useState([])
  const [clothesData, setClothesData] = useState([])
  const navigate = useNavigate()




  // 处理确认按钮点击事件
  const handleBtnClick = () => {
    if (!scene) {
      Toast.show({
        content: '请输入场景',
        duration: 1000,
      })
      return
    }
    generateSceneSuits()
  }

  // 获取所有衣物数据
  const getAllClothes = () => {
    axios.get('/clothes/all').then(res => {
      setClothesData(res.data)
    })
  }

  // 生成场景套装
  const generateSceneSuits = () => {
    console.log('generateSceneSuits', scene)
    axios.post('/scene/generateSceneSuits', {
      scene,
    }).then(res => {
      console.log('generateSceneSuits', res)
    })
  }

  useEffect(() => {
    getAllClothes()
  }, [])
  return (
    <div className={styles['recommend']}>

      <div className={styles['chat']} onClick={() => navigate('/aichat')}>
        <SvgIcon iconName="icon-zhinengkefu" className={styles['chat-icon']} />
        <p>AI助手</p>
      </div>

      <div className={styles['entrance']}>
        <SvgIcon iconName="icon-24gf-folderHeart" className={styles['entrance-icon']} />
        <p>套装库</p>
      </div>

      <div className={styles['recommend-header']}>
        <SvgIcon iconName="icon-icon-sousuo" className={styles['search-icon']} />
        <input type="text" placeholder="请输入场景(如约会、运动)" value={scene} onChange={(e) => setScene(e.target.value)} />

        <button onClick={handleBtnClick}>确认</button>


      </div>

      <div className={styles['recommend-body']}>
        <div className={styles['recommend-body-history']}>
          <div className={styles['history-item']}>职场</div>
          <div className={styles['history-item']}>居家</div>
          <div className={styles['history-item']}>运动</div>
        </div>
        <div className={styles['recommend-body-content']}>
          <div className={styles['content-item']}>
            <div className={styles['item-img']}>
              <img src={first} alt="" />
            </div>
            <div className={styles['item-message']}>你的藏青色西装 + 白色衬衫 + 黑色西裤</div>
            <div className={styles['item-scene']}>商务正式</div>
            <div className={styles['item-edit']}>
              <SvgIcon iconName="icon-icon-test" className={styles['edit-icon']} />
            </div>
            <div className={styles['item-love']}>
              <SvgIcon iconName="icon-aixin" className={styles['love-icon']} />
            </div>
          </div>
          <div className={styles['content-item']}>
            <div className={styles['item-img']}>
              <img src={second} alt="" />
            </div>
            <div className={styles['item-message']}>你的米色针织衫 + 浅蓝色牛仔裤 + 棕色配饰</div>
            <div className={styles['item-scene']}>休闲文艺</div>
            <div className={styles['item-edit']}>
              <SvgIcon iconName="icon-icon-test" className={styles['edit-icon']} />
            </div>
            <div className={styles['item-love']}>
              <SvgIcon iconName="icon-aixin" className={styles['love-icon']} />
            </div>
          </div>
          <div className={styles['content-item']}>
            <div className={styles['item-img']}>
              <img src={third} alt="" />
            </div>
            <div className={styles['item-message']}>你的黑色高领毛衣 + 灰色羊毛裤 + 乐福鞋</div>
            <div className={styles['item-scene']}>晚间约会</div>
            <div className={styles['item-edit']}>
              <SvgIcon iconName="icon-icon-test" className={styles['edit-icon']} />
            </div>
            <div className={styles['item-love']}>
              <SvgIcon iconName="icon-aixin" className={styles['love-icon']} />
            </div>
          </div>
          
        </div>
        <div className={styles['recommend-body-footer']}>
          <div className={styles['footer-btn']}>
            <SvgIcon iconName="icon-shuaxin" className={styles['btn-icon']} />
            换一批
          </div>
        </div>
      </div>
    </div>
  )
}

