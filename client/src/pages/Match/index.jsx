import React, { useState, useEffect, useCallback } from 'react'
import styles from './index.module.less'
import test from '@/assets/test.jpg'
import { Overlay, Loading } from 'react-vant';
import axios from '@/api'
import { useNavigate } from 'react-router-dom'
import { Toast } from 'antd-mobile';
import { useAuthStore } from '@/store'


const safeParseUserInfo = () => {
  const raw = localStorage.getItem('userInfo')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.error('解析用户信息失败:', err)
    return null
  }
}

export default function Match() {
  const navigate = useNavigate()
  const authUserInfo = useAuthStore((s) => s.userInfo)
  const accessToken = useAuthStore((s) => s.accessToken)
  const setAuthUserInfo = useAuthStore((s) => s.setUserInfo)
  const [activeTab, setActiveTab] = useState('top') // 'top' 为上衣，'bottom' 为下衣
  const [showPreview, setShowPreview] = useState(false) // 是否展示预览图
  const [visible, setVisible] = useState(false); // 是否显示遮罩层
  const [topClothes, setTopClothes] = useState(null); // 上衣
  const [bottomClothes, setBottomClothes] = useState(null); // 下衣
  const [topClothesData, setTopClothesData] = useState([]); // 上衣数据
  const [bottomClothesData, setBottomClothesData] = useState([]); // 下衣数据
  const [selectedShow, setSelectedShow] = useState('上衣')
  const [previewImageUrl, setPreviewImageUrl] = useState(''); // 预览图URL
  const [userInfo, setUserInfo] = useState(() => authUserInfo || safeParseUserInfo())
  const [userLoading, setUserLoading] = useState(false)
  const [loading, setLoading] = useState(false) // 加载中
  const sex = userInfo?.sex || ''
  const characterModel = userInfo?.characterModel || ''
  const hasInstantLook = Boolean(topClothes?.image) && Boolean(bottomClothes?.image)
  const stageHint =
    !topClothes && !bottomClothes
      ? '点击上方衣物，即刻预览搭配效果'
      : topClothes && !bottomClothes
        ? '已选上衣，再点选一件下衣，即刻预览搭配效果'
        : !topClothes && bottomClothes
          ? '已选下衣，再点选一件上衣，即刻预览搭配效果'
          : '搭配已就绪，点击下方按钮生成预览图'

  const fetchUserInfo = useCallback(async () => {
    setUserLoading(true)
    try {
      const res = await axios.get('/user/getUserInfo')
      const nextUser = res?.data || null
      if (nextUser) {
        setUserInfo(nextUser)
        setAuthUserInfo(nextUser)
        const persistedUserInfo = {
          username: nextUser.username,
          id: nextUser.id,
          createTime: nextUser.createTime || nextUser.create_time,
          sex: nextUser.sex,
          avatar: nextUser.avatar,
          hasCharacterModel: Boolean(nextUser.characterModel),
        }
        const value = JSON.stringify(persistedUserInfo)
        try {
          localStorage.setItem('userInfo', value)
        } catch {
          try {
            localStorage.removeItem('userInfo')
            localStorage.setItem('userInfo', value)
          } catch (retryError) {
            console.warn('persist userInfo failed:', retryError)
          }
        }
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
      Toast.show({
        content: '获取用户信息失败，请重新登录',
        duration: 1200,
      })
    } finally {
      setUserLoading(false)
    }
  }, [setAuthUserInfo, setUserInfo])

  useEffect(() => {
    if (accessToken) fetchUserInfo()
  }, [accessToken, fetchUserInfo])

  useEffect(() => {
    if (authUserInfo) {
      setUserInfo((prev) => prev || authUserInfo)
    }
  }, [authUserInfo])


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
    if (!topClothes?.image || !bottomClothes?.image) {
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
        },
        timeout: 60000,
      })

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
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    getClothesData()
  }, [])


  return (

    <div className={styles.match}>

      <div className={styles['match-loading']} style={{ display: (loading || userLoading) ? 'flex' : 'none' }}>
        <Loading size="24px" textColor="#3f45ff" color='#3f45ff'>{userLoading ? '正在获取用户信息...' : '正在生成中...'}</Loading>
      </div>

      <div className={styles['match-header']}>
        <div className={styles['match-header-title']}>
          搭配中心
        </div>
      </div>

      <div className={styles['match-content']}>
        <div className={styles['match-content-title']}>
          <div
            className={`${styles['match-content-title-indicator']} ${activeTab === 'bottom' ? styles['match-content-title-indicator-bottom'] : ''}`}
          />
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
                    onClick={() => {
                      setTopClothes(item)
                      setShowPreview(false)
                      setPreviewImageUrl('')
                    }}
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
                    onClick={() => {
                      setBottomClothes(item)
                      setShowPreview(false)
                      setPreviewImageUrl('')
                    }}
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
              <div className={styles['stage']}>
                <div className={styles['stage-header']}>
                  <div className={styles['stage-title']}>搭配预览</div>
                  <div className={styles['stage-subtitle']}>{stageHint}</div>
                </div>

                {hasInstantLook ? (
                  <div className={styles['stage-look']}>
                    <div className={styles['stage-look-canvas']}>
                      <div className={styles['stage-look-badge']}>实时拼贴</div>
                      <div className={styles['stage-look-top']}>
                        <img
                          src={topClothes.image}
                          alt={topClothes.name || '上衣'}
                          onError={(e) => {
                            e.target.src = test
                          }}
                        />
                      </div>
                      <div className={styles['stage-look-divider']} />
                      <div className={styles['stage-look-bottom']}>
                        <img
                          src={bottomClothes.image}
                          alt={bottomClothes.name || '下衣'}
                          onError={(e) => {
                            e.target.src = test
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles['stage-look-names']}>
                      <span className={styles['stage-look-chip']}>{topClothes.name || '上衣'}</span>
                      <span className={styles['stage-look-plus']}>+</span>
                      <span className={styles['stage-look-chip']}>{bottomClothes.name || '下衣'}</span>
                    </div>
                  </div>
                ) : (
                  <div className={styles['stage-slots']}>
                  <div className={`${styles['stage-slot']} ${topClothes ? styles['stage-slot-active'] : ''}`}>
                    <div className={styles['stage-slot-image']}>
                      {topClothes?.image ? (
                        <img
                          src={topClothes.image}
                          alt={topClothes.name || '上衣'}
                          onError={(e) => {
                            e.target.src = test
                          }}
                        />
                      ) : (
                        <div
                          className={styles['stage-slot-placeholder']}
                        >
                          <svg
                            className={styles['stage-slot-placeholder-icon']}
                            viewBox="0 0 64 64"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                          >
                            <path
                              d="M32 14c4 0 7 3 7 7 0 2-1 4-3 6l-4 4"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M14 44l18-12 18 12"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M14 44h36"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div
                      className={`${styles['stage-slot-title']} ${topClothes ? '' : styles['stage-slot-title-muted']}`}
                    >
                      {topClothes?.name || '上衣'}
                    </div>
                  </div>

                  <div className={`${styles['stage-slot']} ${bottomClothes ? styles['stage-slot-active'] : ''}`}>
                    <div className={styles['stage-slot-image']}>
                      {bottomClothes?.image ? (
                        <img
                          src={bottomClothes.image}
                          alt={bottomClothes.name || '下衣'}
                          onError={(e) => {
                            e.target.src = test
                          }}
                        />
                      ) : (
                        <div
                          className={styles['stage-slot-placeholder']}
                        >
                          <svg
                            className={styles['stage-slot-placeholder-icon']}
                            viewBox="0 0 64 64"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                          >
                            <path
                              d="M18 20h28"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M24 20v26c0 2 2 4 4 4h8c2 0 4-2 4-4V20"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <path
                              d="M32 20v30"
                              stroke="currentColor"
                              strokeWidth="2.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div
                      className={`${styles['stage-slot-title']} ${
                        bottomClothes ? '' : styles['stage-slot-title-muted']
                      }`}
                    >
                      {bottomClothes?.name || '下衣'}
                    </div>
                  </div>
                </div>
                )}
              </div>
            )
          }
        </div>

        <div className={styles['match-content-actions']}>
          <div className={styles['match-content-delete']}>
            <button className={styles['delete-btn']} onClick={() => {
              setShowPreview(false);
              setPreviewImageUrl('');
              setTopClothes(null);
              setBottomClothes(null);
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
