import React, { useState, useEffect } from 'react'
import styles from './index.module.less'
import test from '@/assets/test.jpg'
import SvgIcon from '@/components/SvgIcon'
import { Overlay } from 'react-vant';
import axios from '@/api'



export default function Match() {
  const [activeTab, setActiveTab] = useState('top') // 'top' 为上衣，'bottom' 为下衣
  const [showPreview, setShowPreview] = useState(false) // 是否展示预览图
  const [visible, setVisible] = useState(false); // 是否显示遮罩层
  const [topClothes, setTopClothes] = useState([]); // 上衣
  const [bottomClothes, setBottomClothes] = useState([]); // 下衣
  const [sex, setSex] = useState(''); // 性别
  const [characterModel, setCharacterModel] = useState(''); // 人物模特图
  const [topClothesData, setTopClothesData] = useState([]); // 上衣数据
  const [bottomClothesData, setBottomClothesData] = useState([]); // 下衣数据
  const [selectedShow, setSelectedShow] = useState('上衣')


  const getClothesData = async () => {
    const resTop = await axios.get('/clothes/TopClothes')
    console.log(resTop.data);
    setTopClothesData(resTop.data)
    const resBot = await axios.get('/clothes/BotClothes')
    console.log(resBot.data);
    setBottomClothesData(resBot.data)
  }

  useEffect(() => {
    getClothesData()
  }, [])


  return (

    <div className={styles.match}>

      <div className={styles['match-header']}>
        <div className={styles['match-header-title']}>
          搭配中心
        </div>
      </div>

      <div className={styles['match-content']}>
        <div className={styles['match-content-title']}>
          <div
            className={`${styles['match-content-title-left']} ${activeTab === 'top' ? styles['active'] : styles['inactive']}`}
            onClick={() => {setActiveTab('top'), setSelectedShow('上衣')}}
          >
            上衣
          </div>
          <div
            className={`${styles['match-content-title-right']} ${activeTab === 'bottom' ? styles['active'] : styles['inactive']}`}
            onClick={() => {setActiveTab('bottom'), setSelectedShow('下衣')}}
          >
            下衣
          </div>
        </div>
        <div className={styles['match-content-material']}>
          <div className={styles['match-content-material-display']}>
            {
              selectedShow === '上衣' ? (
                topClothesData.map((item, index) => (
                  <div className={styles['match-content-material-display-item']} key={index}>
                    <div className={styles['match-content-material-display-item-img']}>
                      <img src={item.image} alt='' />
                    </div>
                    <div className={styles['match-content-material-display-item-name']}>
                      {item.name}
                    </div>
                  </div>
                ))
              ) : (
                bottomClothesData.map((item, index) => (
                  <div className={styles['match-content-material-display-item']} key={index}>
                    <div className={styles['match-content-material-display-item-img']}>
                      <img src={item.image} alt='' />
                    </div>
                    <div className={styles['match-content-material-display-item-name']}>
                      {item.name}
                    </div>
                  </div>
                )
                )
              )
            }
          </div>
          <div className={styles['match-content-material-prompt']}>
            <span className={styles['prompt-icon']}>→</span>
            <span>向右滑动查看更多</span>
          </div>
        </div>
        <div className={styles['match-content-show']}>
          {
            showPreview ? (
              <div className={styles['preview']}>
                <div className={styles['preview-img']}>
                  <img src={test} alt='' />
                </div>
              </div>
            ) : (
              <div className={styles['empty-state']}>
                <div className={styles['empty-icon']}>
                  <SvgIcon iconName='icon-tubiao-' />
                </div>
                <div className={styles['empty-text']}>
                  选中上方衣物开始搭配
                </div>
              </div>
            )
          }
        </div>

        <div className={styles['match-content-actions']}>
          <div className={styles['match-content-delete']}>
            <button className={styles['delete-btn']}>清空</button>
          </div>
          <div className={styles['match-content-generate']}>
            <button className={styles['save-btn']}>生成预览图</button>
          </div>
        </div>
      </div>

      <Overlay visible={visible} onClick={() => setVisible(false)}
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <div style={{ width: 120, height: 120, backgroundColor: '#fff', borderRadius: 4 }} />
      </Overlay>
    </div>
  )
}
