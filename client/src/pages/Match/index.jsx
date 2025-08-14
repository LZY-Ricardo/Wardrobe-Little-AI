import React, { useState, useEffect } from 'react'
import styles from './index.module.less'
import test from '@/assets/test.jpg'
import SvgIcon from '@/components/SvgIcon'
import { Overlay, Loading } from 'react-vant';
import axios from '@/api'
import { useNavigate } from 'react-router-dom'
import { Toast } from 'antd-mobile';




export default function Match() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('top') // 'top' 为上衣，'bottom' 为下衣
  const [showPreview, setShowPreview] = useState(false) // 是否展示预览图
  const [visible, setVisible] = useState(false); // 是否显示遮罩层
  const [topClothes, setTopClothes] = useState([]); // 上衣
  const [bottomClothes, setBottomClothes] = useState([]); // 下衣
  const [topClothesData, setTopClothesData] = useState([]); // 上衣数据
  const [bottomClothesData, setBottomClothesData] = useState([]); // 下衣数据
  const [selectedShow, setSelectedShow] = useState('上衣')
  const [previewImageUrl, setPreviewImageUrl] = useState(''); // 预览图URL
  const localData = localStorage.getItem('userInfo')
  const userInfo = JSON.parse(localData)
  const [sex, setSex] = useState(userInfo.sex) // 性别
  const [characterModel, setCharacterModel] = useState(userInfo.characterModel) // 人物模特图
  const [loading, setLoading] = useState(false) // 加载中


  // 获取衣服数据
  const getClothesData = async () => {
    const resTop = await axios.get('/clothes/TopClothes')
    console.log(resTop.data);
    setTopClothesData(resTop.data)
    const resBot = await axios.get('/clothes/BotClothes')
    console.log(resBot.data);
    setBottomClothesData(resBot.data)
  }

  // 生成预览图
  const handleGenerate = async () => {
    if (!topClothes || !bottomClothes) {
      Toast.show({
        content: '请选择上衣和下衣',
        duration: 1000,
      })
      return
    }
    if (sex !== 'man' && sex !== 'woman') {
      Toast.show({
        content: '请您先设置性别',
        duration: 1000,
      })
      navigate('/person')
      return
    }
    if (!characterModel) {
      Toast.show({
        content: '请您先设置人物模特',
        duration: 1000,
      })
      navigate('/person')
      return
    }

    // 调用后端接口 生成预览图
    try {
      // 将 base64 转换成 Blob 再转换为 File
      const top = await fetch(topClothes.image)
      const bottom = await fetch(bottomClothes.image)
      const model = await fetch(characterModel)

      const topBlob = await top.blob()
      const bottomBlob = await bottom.blob()
      const modelBlob = await model.blob()

      const topFile = new File([topBlob], 'top.jpg', { type: 'image/jpeg' })
      const bottomFile = new File([bottomBlob], 'bottom.jpg', { type: 'image/jpeg' })
      const modelFile = new File([modelBlob], 'model.jpg', { type: 'image/jpeg' })

      // 创建FormData对象
      const formData = new FormData()
      formData.append('top', topFile)
      formData.append('bottom', bottomFile)
      formData.append('sex', sex)
      formData.append('characterModel', modelFile)

      setLoading(true)

      const res = await axios.post('/clothes/genPreview', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setLoading(false)

      console.log('生成预览图响应:', res.data);

      // 检查响应是否成功
      if (res && res.code === 1 && res.data) {
        setPreviewImageUrl(res.data);
        setShowPreview(true);
        Toast.show({
          content: '预览图生成成功！',
          duration: 1000,
        });
      } else {
        Toast.show({
          content: '预览图生成失败，请重试',
          duration: 1000,
        });
      }

    } catch (error) {
      console.log('生成预览图错误:', error);
      Toast.show({
        content: '预览图生成失败，请重试',
        duration: 1000,
      });
    }
  }


  useEffect(() => {
    getClothesData()
  }, [])


  return (

    <div className={styles.match}>

      <div className={styles['match-loading']} style={{ display: loading ? 'flex' : 'none' }}>
        <Loading size="24px" textColor="#3f45ff" color='#3f45ff'>正在生成中...</Loading>
      </div>

      <div className={styles['match-header']}>
        <div className={styles['match-header-title']}>
          搭配中心
        </div>
      </div>

      <div className={styles['match-content']}>
        <div className={styles['match-content-title']}>
          <div
            className={`${styles['match-content-title-left']} ${activeTab === 'top' ? styles['active'] : styles['inactive']}`}
            onClick={() => { setActiveTab('top'), setSelectedShow('上衣') }}
          >
            上衣
          </div>
          <div
            className={`${styles['match-content-title-right']} ${activeTab === 'bottom' ? styles['active'] : styles['inactive']}`}
            onClick={() => { setActiveTab('bottom'), setSelectedShow('下衣') }}
          >
            下衣
          </div>
        </div>
        <div className={styles['match-content-material']}>
          <div className={styles['match-content-material-display']}>
            {
              selectedShow === '上衣' ? (
                topClothesData.map((item, index) => (
                  <div
                    className={`${styles['match-content-material-display-item']} ${topClothes === item ? styles['active'] : ''}`}
                    key={index}
                    onClick={() => setTopClothes(item)}
                  >
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
                  <div
                    className={`${styles['match-content-material-display-item']} ${bottomClothes === item ? styles['active'] : ''}`}
                    key={index}
                    onClick={() => setBottomClothes(item)}
                  >
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
            showPreview && previewImageUrl ? (
              <div className={styles['preview']}>
                <div className={styles['preview-img']}>
                  <img src={previewImageUrl} alt='预览图' onError={(e) => {
                    console.error('图片加载失败:', previewImageUrl);
                    e.target.src = test; // 加载失败时使用默认图片
                  }} />
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
            <button className={styles['delete-btn']} onClick={() => {
              setShowPreview(false);
              setPreviewImageUrl('');
              setTopClothes([]);
              setBottomClothes([]);
              Toast.show({
                content: '已清空选择',
                duration: 1000,
              });
            }}>清空</button>
          </div>
          <div className={styles['match-content-generate']} onClick={handleGenerate}>
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
