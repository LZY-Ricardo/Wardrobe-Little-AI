import React, { useEffect, useRef, useState } from 'react'
import styles from './index.module.less'
import { useNavigate } from 'react-router-dom'
import { Dialog } from 'react-vant'
import { Toast } from 'antd-mobile'
import axios from '@/api'


export default function Person() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null) // 图片上传input
  const [uploadedImage, setUploadedImage] = useState(null) // 展示预览图片
  const [uploading, setUploading] = useState(false) // 上传中
  const [userInfo, setUserInfo] = useState({}) // 保存用户信息
  const [isEditingName, setIsEditingName] = useState(false) // 是否正在编辑昵称
  const [editName, setEditName] = useState('') // 编辑中的昵称

  // 获取用户所有信息
  const getUserInfo = async () => {
    try {
      const res = await axios.get('/user/getUserInfo')
      console.log('获取用户信息成功:', res);
      setUserInfo(res.data)
      const data = {
        username: res.data.username,
        id: res.data.id,
        createTime: res.data.createTime,
        sex: res.data.sex,
        characterModel: res.data.characterModel,
      }
      localStorage.setItem('userInfo', JSON.stringify(data))
    } catch (error) {
      console.error('获取用户信息失败:', error);
    }
  }

  // 退出登录
  const handleLogout = () => {
    // 清除本地存储的用户信息
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('userInfo')
    // 跳转到登录页面
    navigate('/login')
  }

  // 上传图片Input框的触发点击函数
  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  // 移除上传的图片
  const handleRemoveImage = () => {
    setUploadedImage(null)
    // 清空文件input的值
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 开始编辑昵称
  const handleEditName = () => {
    setEditName(userInfo.name || '')
    setIsEditingName(true)
  }

  // 保存昵称
  const handleSaveName = async () => {
    if (!editName.trim()) {
      Toast.show({
        icon: 'error',
        content: '昵称不能为空',
        duration: 2000,
      })
      return
    }

    try {
      const res = await axios.put('/user/updateUserName', {
        name: editName.trim()
      })
      console.log('修改昵称成功:', res);
      setUserInfo({ ...userInfo, name: editName.trim() })
      setIsEditingName(false)
      Toast.show({
        icon: 'success',
        content: '昵称修改成功',
        duration: 2000,
      })
      getUserInfo()
    } catch (error) {
      console.error('修改昵称失败:', error)
      Toast.show({
        icon: 'error',
        content: '修改失败，请重试',
        duration: 2000,
      })
    }
  }

  // 取消编辑昵称
  const handleCancelEdit = () => {
    setIsEditingName(false)
    setEditName('')
  }

  // 上传图片
  const handleFileChange = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      Toast.show({
        icon: 'fail',
        content: '请选择图片文件',
        duration: 1000
      });
      return;
    }

    // 验证文件大小（限制为5MB）
    if (file.size > 5 * 1024 * 1024) {
      Toast.show({
        icon: 'error',
        content: '图片大小不能超过5MB',
        duration: 2000,
      })
      return
    }

    if (file.size < 1024 * 100) {
      Toast.show({
        icon: 'error',
        content: '图片大小不能小于100KB',
        duration: 2000,
      })
      return
    }

    setUploading(true)

    try {
      // 将文件转换为base64
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64Data = e.target.result

        try {
          // 发送base64数据到后端
          const res = await axios.post('/user/uploadPhoto', {
            image: base64Data
          })
          console.log(res);

          // 创建预览URL
          const imageUrl = URL.createObjectURL(file)
          setUploadedImage(imageUrl)

          Toast.show({
            icon: 'success',
            content: '上传成功',
            duration: 2000,
          })

          // 清空文件input的值，允许重复上传
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        } catch (error) {
          console.error('上传失败:', error)
          Toast.show({
            icon: 'error',
            content: '上传失败，请重试',
            duration: 2000,
          })

          // 清空文件input的值
          if (fileInputRef.current) {
            fileInputRef.current.value = ''
          }
        } finally {
          setUploading(false)
        }
      }

      reader.onerror = () => {
        Toast.show({
          icon: 'error',
          content: '文件读取失败',
          duration: 2000,
        })
        setUploading(false)

        // 清空文件input的值
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }

      // 读取文件为base64
      reader.readAsDataURL(file)

    } catch (error) {
      console.error('处理文件失败:', error)
      Toast.show({
        icon: 'error',
        content: '处理文件失败，请重试',
        duration: 2000,
      })
      setUploading(false)

      // 清空文件input的值
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  useEffect(() => {
    getUserInfo()
  }, [])


  return (
    <div className={styles.person}>
      {/* 用户信息区域 */}
      <div className={styles.userInfo}>
        <div className={styles.avatar}>
          <div className={styles.avatarIcon}>
            <svg viewBox="0 0 1024 1024" width="40" height="40">
              <path d="M512 512m-160 0a160 160 0 1 0 320 0 160 160 0 1 0-320 0Z" fill="#ccc" />
              <path d="M512 704c-123.2 0-224 100.8-224 224h448c0-123.2-100.8-224-224-224z" fill="#ccc" />
            </svg>
          </div>
        </div>
        <div className={styles.userDetails}>
          <div className={styles.userName}>
            {isEditingName ? (
              <div className={styles.editNameContainer}>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={styles.nameInput}
                  placeholder="请输入昵称"
                  maxLength={20}
                  autoFocus
                />
                <div className={styles.editButtons}>
                  <button className={styles.saveBtn} onClick={handleSaveName}>
                    保存
                  </button>
                  <button className={styles.cancelBtn} onClick={handleCancelEdit}>
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                {userInfo.name || '未命名'}
                <svg className={styles.editIcon} viewBox="0 0 1024 1024" width="16" height="16" onClick={handleEditName}>
                  <path d="M257.7 752c2 0 4-.2 6-.5L431.9 722c2-.4 3.9-1.3 5.3-2.8l423.9-423.9c3.9-3.9 3.9-10.2 0-14.1L694.9 114.9c-1.9-1.9-4.4-2.9-7.1-2.9s-5.2 1-7.1 2.9L256.8 538.8c-1.5 1.5-2.4 3.3-2.8 5.3l-29.5 168.2c-1.9 11.1 1.5 21.9 9.4 29.8 6.6 6.4 15.6 9.9 25.8 9.9z" fill="#999" />
                </svg>
              </>
            )}
          </div>
          <div className={styles.userAccount}>账号：{userInfo.username ? `${userInfo.username.slice(0, 3)}×××${userInfo.username.slice(-3)}` : ''}</div>
          <div className={styles.uploadPhoto} onClick={handleUploadClick}>
            <svg viewBox="0 0 1024 1024" width="16" height="16">
              <path d="M864 248H728l-32.4-90.8a32.07 32.07 0 0 0-30.2-21.2H358.6c-13.5 0-25.6 8.5-30.1 21.2L296 248H160c-44.2 0-80 35.8-80 80v456c0 44.2 35.8 80 80 80h704c44.2 0 80-35.8 80-80V328c0-44.2-35.8-80-80-80zM512 716c-88.4 0-160-71.6-160-160s71.6-160 160-160 160 71.6 160 160-71.6 160-160 160z" fill="#999" />
            </svg>
            {uploading ? '上传中...' : '上传全身照'}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {uploadedImage && (
            <div className={styles.imagePreview}>
              <img src={uploadedImage} alt="上传的全身照" />
              <button className={styles.removeButton} onClick={handleRemoveImage}>
                <svg viewBox="0 0 1024 1024" width="16" height="16">
                  <path d="M563.8 512l262.5-312.9c4.4-5.2.7-13.1-6.1-13.1h-79.8c-4.7 0-9.2 2.1-12.3 5.7L511.6 449.8 295.1 191.7c-3-3.6-7.5-5.7-12.3-5.7H203c-6.8 0-10.5 7.9-6.1 13.1L459.4 512 196.9 824.9A7.95 7.95 0 0 0 203 838h79.8c4.7 0 9.2-2.1 12.3-5.7l216.5-258.1 216.5 258.1c3 3.6 7.5 5.7 12.3 5.7h79.8c6.8 0 10.5-7.9 6.1-13.1L563.8 512z" fill="#fff" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 功能列表 */}
      <div className={styles.menuList}>
        <div className={styles.menuItem}>
          <div className={styles.menuLeft}>
            <svg className={styles.menuIcon} viewBox="0 0 1024 1024" width="20" height="20">
              <path d="M832 464h-68V240c0-70.7-57.3-128-128-128H388c-70.7 0-128 57.3-128 128v224h-68c-17.7 0-32 14.3-32 32v384c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V496c0-17.7-14.3-32-32-32zM332 240c0-30.9 25.1-56 56-56h248c30.9 0 56 25.1 56 56v224H332V240zm496 600H196V536h632v304z" fill="#666" />
            </svg>
            修改密码
          </div>
          <svg className={styles.arrow} viewBox="0 0 1024 1024" width="16" height="16">
            <path d="M765.7 486.8L314.9 134.7A7.97 7.97 0 0 0 302 141v77.3c0 4.9 2.3 9.6 6.1 12.6l360 281.1-360 281.1c-3.9 3-6.1 7.7-6.1 12.6V883c0 6.7 7.7 10.4 12.9 6.3l450.8-352.1a31.96 31.96 0 0 0 0-50.4z" fill="#ccc" />
          </svg>
        </div>

        <div className={styles.menuItem}>
          <div className={styles.menuLeft}>
            <svg className={styles.menuIcon} viewBox="0 0 1024 1024" width="20" height="20">
              <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z" fill="#666" />
              <path d="M464 336a48 48 0 1 0 96 0 48 48 0 1 0-96 0zm72 112h-48c-4.4 0-8 3.6-8 8v272c0 4.4 3.6 8 8 8h48c4.4 0 8-3.6 8-8V456c0-4.4-3.6-8-8-8z" fill="#666" />
            </svg>
            性别
          </div>
          <div className={styles.menuRight}>
            <span className={styles.genderValue}>女</span>
            <svg className={styles.arrow} viewBox="0 0 1024 1024" width="16" height="16">
              <path d="M765.7 486.8L314.9 134.7A7.97 7.97 0 0 0 302 141v77.3c0 4.9 2.3 9.6 6.1 12.6l360 281.1-360 281.1c-3.9 3-6.1 7.7-6.1 12.6V883c0 6.7 7.7 10.4 12.9 6.3l450.8-352.1a31.96 31.96 0 0 0 0-50.4z" fill="#ccc" />
            </svg>
          </div>
        </div>

        <div className={styles.menuItem} onClick={() =>
          Dialog.confirm({
            message: '确定退出登录吗？',
            onCancel: () => console.log('cancel'),
            onConfirm: () => handleLogout(),
          })
        }>
          <div className={styles.menuLeft}>
            <svg className={styles.menuIcon} viewBox="0 0 1024 1024" width="20" height="20">
              <path d="M868 732h-70.3c-4.8 0-9.3 2.1-12.3 5.8-7 8.5-14.5 16.7-22.4 24.5a353.84 353.84 0 0 1-112.7 75.9A352.8 352.8 0 0 1 512.4 866c-47.9 0-94.3-9.4-137.9-27.8a353.84 353.84 0 0 1-112.7-75.9 353.28 353.28 0 0 1-76-112.5C167.3 606.2 158 559.9 158 512s9.4-94.2 27.8-137.8c17.8-42.1 43.4-80 76-112.5s70.5-58.1 112.7-75.9c43.6-18.4 90-27.8 137.9-27.8 47.9 0 94.3 9.3 137.9 27.8 42.2 17.8 80.1 43.4 112.7 75.9 7.9 7.9 15.3 16.1 22.4 24.5 3 3.7 7.6 5.8 12.3 5.8H868c6.3 0 10.2-7 6.7-12.3C836 274.2 704.5 158 512.4 158 283.9 158 96 345.8 96 574.3s187.9 416.3 416.4 416.3c192.2 0 323.6-116.2 361.9-279.4 3.4-5.3-.4-12.3-6.3-12.3z" fill="#ff4d4f" />
              <path d="M912 462H516c-4.4 0-8 3.6-8 8v84c0 4.4 3.6 8 8 8h396c4.4 0 8-3.6 8-8v-84c0-4.4-3.6-8-8-8z" fill="#ff4d4f" />
            </svg>
            退出登录
          </div>
          <svg className={styles.arrow} viewBox="0 0 1024 1024" width="16" height="16">
            <path d="M765.7 486.8L314.9 134.7A7.97 7.97 0 0 0 302 141v77.3c0 4.9 2.3 9.6 6.1 12.6l360 281.1-360 281.1c-3.9 3-6.1 7.7-6.1 12.6V883c0 6.7 7.7 10.4 12.9 6.3l450.8-352.1a31.96 31.96 0 0 0 0-50.4z" fill="#ccc" />
          </svg>
        </div>
      </div>
    </div>
  )
}
