import React, { useCallback, useEffect, useRef, useState } from 'react'
import styles from './index.module.less'
import { useNavigate } from 'react-router-dom'
import { Dialog, Popup, Picker, Selector } from 'react-vant'
import { Toast } from 'antd-mobile'
import axios from '@/api'
import { buildAgentContextState } from '@/utils/agentContext'
import useAgentPageEntry from '@/hooks/useAgentPageEntry'
import { useAuthStore, useClosetStore } from '@/store'
import { Loading, ErrorBanner } from '@/components/Feedback'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const PROFILE_STORAGE_KEY = 'outfit-profile-v1'
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 64
const PASSWORD_RULE_MESSAGE = `密码需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位，且包含大写字母、小写字母、数字和特殊字符`

const isStrongPassword = (value) =>
  /[a-z]/.test(value) &&
  /[A-Z]/.test(value) &&
  /\d/.test(value) &&
  /[^A-Za-z0-9]/.test(value) &&
  !/\s/.test(value)

const emptyProfile = {
  city: '',
  heightCm: '',
  weightKg: '',
  topSize: '',
  bottomSize: '',
  shoeSize: '',
  style: '',
  colors: '',
  scenes: '',
}

const readLocalProfile = () => {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) return { ...emptyProfile }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...emptyProfile }
    return { ...emptyProfile, ...parsed }
  } catch (error) {
    console.warn('read profile failed:', error)
    return { ...emptyProfile }
  }
}

const persistLocalProfile = (profile) => {
  const value = JSON.stringify(profile)
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, value)
  } catch {
    try {
      localStorage.removeItem(PROFILE_STORAGE_KEY)
      localStorage.setItem(PROFILE_STORAGE_KEY, value)
    } catch (retryError) {
      console.warn('persist profile failed:', retryError)
    }
  }
}

const splitPreference = (value) => {
  if (!value || typeof value !== 'string') return []
  return value
    .split(/[/、,，|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const joinPreference = (values) => {
  if (!Array.isArray(values)) return ''
  return values.map((item) => String(item).trim()).filter(Boolean).join(' / ')
}

const uniqStrings = (values) => {
  const seen = new Set()
  const result = []
  values.forEach((value) => {
    const key = String(value).trim()
    if (!key) return
    if (seen.has(key)) return
    seen.add(key)
    result.push(key)
  })
  return result
}

const summarizeAssetStats = (list) => {
  const clothes = Array.isArray(list) ? list : []
  return {
    clothesCount: clothes.length,
    favoriteCount: clothes.reduce((count, item) => count + (item?.favorite ? 1 : 0), 0),
  }
}

const SIZE_PICKER_META = {
  topSize: { title: '选择上装尺码', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  bottomSize: {
    title: '选择下装尺码',
    options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  },
  shoeSize: {
    title: '选择鞋码',
    options: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'],
  },
}

const PREF_PICKER_META = {
  style: {
    title: '选择风格',
    options: ['通勤', '休闲', '运动', '简约', '街头', '复古', '学院', '韩系', '日系', '甜酷'],
    columns: 4,
  },
  colors: {
    title: '选择偏好颜色',
    options: ['黑白', '大地色', '蓝色', '灰色', '米色', '棕色', '绿色', '红色', '粉色', '紫色'],
    columns: 4,
  },
  scenes: {
    title: '选择常用场景',
    options: ['通勤', '上班', '约会', '旅行', '运动', '居家', '聚会', '面试', '上学'],
    columns: 3,
  },
}

export default function Person() {
  const navigate = useNavigate()
  const clearTokens = useAuthStore((s) => s.clearTokens)
  const avatarInputRef = useRef(null)
  const fileInputRef = useRef(null) // 图片上传input
  const [uploadedImage, setUploadedImage] = useState(null) // 展示预览图片
  const [uploading, setUploading] = useState(false) // 上传中
  const [userInfo, setUserInfo] = useState({}) // 保存用户信息
  const [isEditingName, setIsEditingName] = useState(false) // 是否正在编辑昵称
  const [editName, setEditName] = useState('') // 编辑中的昵称
  const [sexVisible, setSexVisible] = useState(false) // 性别弹窗是否显示
  const [sex, setSex] = useState('') // 性别
  const [passwordVisible, setPasswordVisible] = useState(false) // 密码弹窗是否显示
  const [oldPassword, setOldPassword] = useState('') // 旧密码
  const [newPassword, setNewPassword] = useState('') // 新密码
  const [confirmPassword, setConfirmPassword] = useState('') // 确认新密码
  const [avatar, setAvatar] = useState('') // 头像
  const [userLoading, setUserLoading] = useState(true)
  const [userError, setUserError] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [nameSaving, setNameSaving] = useState(false)
  const [sexSaving, setSexSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [modelDeleting, setModelDeleting] = useState(false)
  const [modelPreviewVisible, setModelPreviewVisible] = useState(false)
  const [assetLoading, setAssetLoading] = useState(false)
  const [assetError, setAssetError] = useState('')
  const [assetStats, setAssetStats] = useState({ clothesCount: 0, favoriteCount: 0 })
  const [profile, setProfile] = useState(() => readLocalProfile())
  const [profileDraft, setProfileDraft] = useState(() => readLocalProfile())
  const [profileVisible, setProfileVisible] = useState(false)
  const [sizePickerVisible, setSizePickerVisible] = useState(false)
  const [activeSizeField, setActiveSizeField] = useState('')
  const [sizePickerValue, setSizePickerValue] = useState('')
  const [prefPickerVisible, setPrefPickerVisible] = useState(false)
  const [activePrefField, setActivePrefField] = useState('')
  const [prefSelected, setPrefSelected] = useState([])
  const [, setConfirmDialogVisible] = useState(false)

  const hasCharacterModel = Boolean(userInfo?.characterModel || uploadedImage)
  const maskedAccount = userInfo.username
    ? `${userInfo.username.slice(0, 3)}×××${userInfo.username.slice(-3)}`
    : ''
  const genderText = sex === 'man' ? '男' : sex === 'woman' ? '女' : '未设置'
  const assetCards = [
    {
      key: 'clothes',
      label: '衣物总数',
      value: assetLoading ? '--' : assetStats.clothesCount,
      onClick: () => navigate('/outfit'),
    },
    {
      key: 'favorite',
      label: '收藏',
      value: assetLoading ? '--' : assetStats.favoriteCount,
      onClick: () => navigate('/outfit'),
    },
  ]
  const quickActions = [
    { key: 'closet', label: '去衣橱', onClick: () => navigate('/outfit') },
    { key: 'add', label: '新增衣物', onClick: () => navigate('/add') },
    { key: 'match', label: '搭配预览', onClick: () => navigate('/match') },
    { key: 'recommend', label: '推荐', onClick: () => navigate('/recommend') },
    { key: 'history', label: '推荐历史', onClick: () => navigate('/recommendations/history') },
    { key: 'logs', label: '穿搭记录', onClick: () => navigate('/outfit-logs') },
    { key: 'insight', label: '偏好画像', onClick: () => navigate('/profile-insights') },
    { key: 'analytics', label: '衣橱分析', onClick: () => navigate('/wardrobe-analytics') },
    { key: 'agent', label: 'Agent', onClick: () => navigate('/unified-agent') },
  ]
  const profileSummary = [
    { key: 'city', label: '城市', value: profile.city || '-' },
    { key: 'heightCm', label: '身高', value: profile.heightCm ? `${profile.heightCm}cm` : '-' },
    { key: 'weightKg', label: '体重', value: profile.weightKg ? `${profile.weightKg}kg` : '-' },
    { key: 'topSize', label: '上装尺码', value: profile.topSize || '-' },
    { key: 'bottomSize', label: '下装尺码', value: profile.bottomSize || '-' },
    { key: 'shoeSize', label: '鞋码', value: profile.shoeSize || '-' },
    { key: 'style', label: '风格', value: profile.style || '-' },
    { key: 'colors', label: '偏好颜色', value: profile.colors || '-' },
    { key: 'scenes', label: '常用场景', value: profile.scenes || '-' },
  ]
  useAgentPageEntry({
    enabled: !userLoading,
    presetTask: '根据我当前的穿搭档案和个人信息，给我一些更适合我的穿搭建议',
    state: buildAgentContextState({
      insight: {
        type: 'styleProfile',
        entity: {
          city: profile.city || '',
          heightCm: profile.heightCm || '',
          weightKg: profile.weightKg || '',
          topSize: profile.topSize || '',
          bottomSize: profile.bottomSize || '',
          shoeSize: profile.shoeSize || '',
          style: profile.style || '',
          colors: profile.colors || '',
          scenes: profile.scenes || '',
          sex: sex || '',
          hasCharacterModel,
          clothesCount: assetStats.clothesCount || 0,
          favoriteCount: assetStats.favoriteCount || 0,
        },
      },
    }),
  })

  // 获取用户所有信息
  const getUserInfo = useCallback(async (forceRefresh = false) => {
    setUserError('')
    setUserLoading(true)
    try {
      // Person page needs full user data (including characterModel).
      const authStore = useAuthStore.getState()
      const data = (await authStore.fetchUserInfo(forceRefresh)) || {}

      setUserInfo(data)
      // 判断是 Base64 格式还是 URL 路径
      if (data?.avatar) {
        if (typeof data.avatar === 'string' && data.avatar.startsWith('data:image/')) {
          // Base64 格式，直接使用
          setAvatar(data.avatar)
        } else {
          // URL 路径，拼接 API_BASE_URL
          setAvatar(`${API_BASE_URL}${data.avatar}`)
        }
      } else {
        setAvatar('')
      }
      setSex(data.sex || '') // 设置性别状态
      const characterModel = data?.characterModel || ''
      if (characterModel) {
        if (typeof characterModel === 'string' && characterModel.startsWith('/')) {
          setUploadedImage(`${API_BASE_URL}${characterModel}?t=${Date.now()}`)
        } else {
          setUploadedImage(characterModel)
        }
      } else {
        setUploadedImage(null)
      }

      const persistedUserInfo = {
        username: data.username,
        name: data.name,
        id: data.id,
        createTime: data.createTime || data.create_time,
        sex: data.sex,
        avatar: data.avatar,
        hasCharacterModel: Boolean(data.characterModel),
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
    } catch (error) {
      console.error('获取用户信息失败:', error)
      setUserError(error?.msg || '获取用户信息失败，请重试')
    } finally {
      setUserLoading(false)
    }
  }, [])

  const fetchAssetStats = useCallback(async (forceRefresh = false) => {
    setAssetError('')

    const closetStore = useClosetStore.getState()
    const cached = closetStore.getCachedClothes()
    const hasFetchedSnapshot = closetStore.lastFetchedAt > 0

    if (!forceRefresh && hasFetchedSnapshot) {
      setAssetStats(summarizeAssetStats(cached))
      setAssetLoading(false)
      return
    }

    setAssetLoading(true)
    try {
      const list = await closetStore.fetchAllClothes(forceRefresh)
      setAssetStats(summarizeAssetStats(list))
    } catch (error) {
      console.error('获取资产统计失败:', error)
      setAssetError('获取资产统计失败，请稍后重试')
    } finally {
      setAssetLoading(false)
    }
  }, [])

  // 退出登录
  const handleLogout = () => {
    clearTokens()
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('userInfo')
    navigate('/login', { replace: true })
  }

  // 上传图片Input框的触发点击函数
  const handleAvatarClick = () => {
    if (userLoading || avatarUploading) return
    avatarInputRef.current?.click()
  }

  const handleAvatarChange = async (event) => {
    if (avatarUploading) return
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      Toast.show({
        icon: 'fail',
        content: '请选择图片文件',
        duration: 1000,
      })
      if (avatarInputRef.current) avatarInputRef.current.value = ''
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      Toast.show({
        icon: 'fail',
        content: '头像图片不能超过2MB',
        duration: 1200,
      })
      if (avatarInputRef.current) avatarInputRef.current.value = ''
      return
    }

    setAvatarUploading(true)

    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64Data = e.target.result
      try {
        const res = await axios.post('/user/uploadAvatar', {
          image: base64Data,
        })
        const avatarPath = res?.data?.avatar
        if (avatarPath) {
          // 判断是 Base64 格式还是 URL 路径
          if (typeof avatarPath === 'string' && avatarPath.startsWith('data:image/')) {
            // Base64 格式，直接使用
            setAvatar(avatarPath)
          } else {
            // URL 路径，拼接 API_BASE_URL
            setAvatar(`${API_BASE_URL}${avatarPath}?t=${Date.now()}`)
          }
        } else if (typeof base64Data === 'string') {
          setAvatar(base64Data)
        }

        Toast.show({
          icon: 'success',
          content: '头像上传成功',
          duration: 1200,
        })
        useAuthStore.getState().invalidateUserCache()
        getUserInfo(true)
      } catch (error) {
        console.error('upload avatar failed:', error)
        Toast.show({
          icon: 'fail',
          content: '头像上传失败',
          duration: 1200,
        })
      } finally {
        setAvatarUploading(false)
        if (avatarInputRef.current) avatarInputRef.current.value = ''
      }
    }

    reader.onerror = () => {
      Toast.show({
        icon: 'fail',
        content: '文件读取失败',
        duration: 1200,
      })
      setAvatarUploading(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }

    reader.readAsDataURL(file)
  }

  const handleUploadClick = () => {
    if (userLoading || uploading || modelDeleting) return
    fileInputRef.current?.click()
  }

  // 删除形象照（后端清理 + 本地清理）
  const handleDeleteCharacterModel = () => {
    if (modelDeleting) return

    if (!userInfo?.characterModel) {
      setModelPreviewVisible(false)
      setUploadedImage(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setConfirmDialogVisible(true)
    Dialog.confirm({
      message: '确定删除当前形象照吗？删除后将无法生成搭配预览图。',
      onCancel: () => {
        setConfirmDialogVisible(false)
      },
      onConfirm: async () => {
        setConfirmDialogVisible(false)
        setModelDeleting(true)
        try {
          await axios.delete('/user/characterModel')
          Toast.show({ icon: 'success', content: '形象照已删除', duration: 1200 })
          setModelPreviewVisible(false)
          setUploadedImage(null)
          useAuthStore.getState().invalidateUserCache()
          getUserInfo(true)
        } catch (error) {
          console.error('删除形象照失败:', error)
          Toast.show({ icon: 'fail', content: '删除失败，请重试', duration: 1200 })
        } finally {
          setModelDeleting(false)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      },
    })
  }

  // 开始编辑昵称
  const handleEditName = () => {
    if (userLoading) return
    setEditName(userInfo.name || '')
    setIsEditingName(true)
  }

  // 保存昵称
  const handleSaveName = async () => {
    if (nameSaving) return
    if (!editName.trim()) {
      Toast.show({
        icon: 'error',
        content: '昵称不能为空',
        duration: 2000,
      })
      return
    }

    setNameSaving(true)
    try {
      await axios.put('/user/updateUserName', {
        name: editName.trim(),
      })
      setUserInfo({ ...userInfo, name: editName.trim() })
      setIsEditingName(false)
      Toast.show({
        icon: 'success',
        content: '昵称修改成功',
        duration: 2000,
      })
      useAuthStore.getState().invalidateUserCache()
      getUserInfo(true)
    } catch (error) {
      console.error('修改昵称失败:', error)
      Toast.show({
        icon: 'error',
        content: '修改失败，请重试',
        duration: 2000,
      })
    } finally {
      setNameSaving(false)
    }
  }

  // 取消编辑昵称
  const handleCancelEdit = () => {
    if (nameSaving) return
    setIsEditingName(false)
    setEditName('')
  }

  // 上传图片
  const handleFileChange = async (event) => {
    if (uploading || modelDeleting) return
    const file = event.target.files[0]
    if (!file) return

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      Toast.show({
        icon: 'fail',
        content: '请选择图片文件',
        duration: 1000,
      })
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    // 验证文件大小（限制为5MB）
    if (file.size > 5 * 1024 * 1024) {
      Toast.show({
        icon: 'error',
        content: '图片大小不能超过5MB',
        duration: 2000,
      })
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    if (file.size < 1024 * 100) {
      Toast.show({
        icon: 'error',
        content: '图片大小不能小于100KB',
        duration: 2000,
      })
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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
          useAuthStore.getState().invalidateUserCache()
          getUserInfo(true)

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

  // 修改性别
  const handleSexChange = async (newSex) => {
    if (sexSaving) return
    const prevSex = sex
    setSex(newSex)
    setSexVisible(false)
    setSexSaving(true)

    try {
      const res = await axios.put('/user/updateSex', {
        sex: newSex,
      })
      console.log('修改性别成功:', res)
      Toast.show({
        icon: 'success',
        content: `性别成功修改为${newSex === 'man' ? '男' : '女'}`,
        duration: 2000,
      })
      useAuthStore.getState().invalidateUserCache()
      getUserInfo(true)
    } catch (error) {
      console.error('修改性别失败:', error)
      setSex(prevSex)
      Toast.show({
        icon: 'error',
        content: '修改性别失败',
        duration: 2000,
      })
    } finally {
      setSexSaving(false)
    }
  }

  const closePasswordPopup = () => {
    setPasswordVisible(false)
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const openProfilePopup = () => {
    setProfileDraft(profile)
    setProfileVisible(true)
  }

  const closeProfilePopup = () => {
    setSizePickerVisible(false)
    setPrefPickerVisible(false)
    setActiveSizeField('')
    setActivePrefField('')
    setProfileVisible(false)
    setProfileDraft(profile)
  }

  const openSizePicker = (field) => {
    const meta = SIZE_PICKER_META[field]
    if (!meta) return
    const current = String(profileDraft?.[field] || '').trim()
    const options = uniqStrings([current, ...meta.options]).filter(Boolean)
    const nextValue = current || options[0] || ''
    setActiveSizeField(field)
    setSizePickerValue(nextValue)
    setSizePickerVisible(true)
  }

  const closeSizePicker = () => {
    setSizePickerVisible(false)
    setActiveSizeField('')
  }

  const confirmSizePicker = (value) => {
    const field = activeSizeField
    if (!field) return
    setProfileDraft((prev) => ({ ...prev, [field]: String(value || '').trim() }))
    closeSizePicker()
  }

  const openPrefPicker = (field) => {
    const meta = PREF_PICKER_META[field]
    if (!meta) return
    const current = String(profileDraft?.[field] || '').trim()
    setActivePrefField(field)
    setPrefSelected(splitPreference(current))
    setPrefPickerVisible(true)
  }

  const closePrefPicker = () => {
    setPrefPickerVisible(false)
    setActivePrefField('')
    setPrefSelected([])
  }

  const confirmPrefPicker = () => {
    const field = activePrefField
    if (!field) return
    setProfileDraft((prev) => ({ ...prev, [field]: joinPreference(prefSelected) }))
    closePrefPicker()
  }

  const handleSaveProfile = () => {
    const next = {
      ...emptyProfile,
      ...profileDraft,
    }

    // 轻量校验：只做基本范围控制，避免异常值污染
    const height = Number(next.heightCm)
    if (next.heightCm !== '' && (!Number.isFinite(height) || height < 50 || height > 260)) {
      Toast.show({ icon: 'fail', content: '身高请填写 50~260 之间的数字', duration: 1200 })
      return
    }

    const weight = Number(next.weightKg)
    if (next.weightKg !== '' && (!Number.isFinite(weight) || weight < 20 || weight > 300)) {
      Toast.show({ icon: 'fail', content: '体重请填写 20~300 之间的数字', duration: 1200 })
      return
    }

    ;['city', 'topSize', 'bottomSize', 'shoeSize', 'style', 'colors', 'scenes'].forEach((key) => {
      if (typeof next[key] === 'string') next[key] = next[key].trim()
    })

    setProfile(next)
    persistLocalProfile(next)
    Toast.show({ icon: 'success', content: '穿搭档案已保存', duration: 1200 })
    setProfileVisible(false)
  }

  // 修改密码
  const handlePasswordChange = async () => {
    if (passwordSaving) return
    const normalizedOldPassword = oldPassword.trim()
    const normalizedNewPassword = newPassword.trim()
    const normalizedConfirmPassword = confirmPassword.trim()

    if (!normalizedOldPassword || !normalizedNewPassword || !normalizedConfirmPassword) {
      Toast.show({
        icon: 'fail',
        content: '请填写完整信息',
        duration: 2000,
      })
      return
    }
    if (normalizedNewPassword !== normalizedConfirmPassword) {
      Toast.show({
        icon: 'fail',
        content: '两次输入密码不一致',
        duration: 2000,
      })
      return
    }
    if (
      normalizedNewPassword.length < PASSWORD_MIN_LENGTH ||
      normalizedNewPassword.length > PASSWORD_MAX_LENGTH
    ) {
      Toast.show({
        icon: 'fail',
        content: PASSWORD_RULE_MESSAGE,
        duration: 2000,
      })
      return
    }
    if (!isStrongPassword(normalizedNewPassword)) {
      Toast.show({
        icon: 'fail',
        content: PASSWORD_RULE_MESSAGE,
        duration: 2000,
      })
      return
    }
    if (normalizedOldPassword === normalizedNewPassword) {
      Toast.show({
        icon: 'fail',
        content: '新密码不能与旧密码相同',
        duration: 2000,
      })
      return
    }

    setPasswordSaving(true)
    try {
      const res = await axios.put('/user/updatePassword', {
        oldPassword: normalizedOldPassword,
        newPassword: normalizedNewPassword,
      })
      console.log('修改密码成功:', res)
      Toast.show({
        icon: 'success',
        content: '密码修改成功',
        duration: 2000,
      })
      useAuthStore.getState().invalidateUserCache()
      closePasswordPopup()
      getUserInfo(true)
    } catch (error) {
      console.error('修改密码失败:', error)
      Toast.show({
        icon: 'fail',
        content: '修改密码失败，请检查您的密码是否正确',
        duration: 2000,
      })
    } finally {
      setPasswordSaving(false)
    }
  }

  useEffect(() => {
    return () => {
      if (uploadedImage && uploadedImage.startsWith('blob:')) {
        URL.revokeObjectURL(uploadedImage)
      }
    }
  }, [uploadedImage])

  useEffect(() => {
    getUserInfo()
  }, [getUserInfo])

  useEffect(() => {
    if (!userInfo?.id) return
    fetchAssetStats()
  }, [userInfo?.id, fetchAssetStats])

  return (
    <div className={styles.person}>
      {userError ? (
        <ErrorBanner message={userError} actionText="重试" onAction={getUserInfo} />
      ) : null}
      {userLoading && !userInfo?.id ? <Loading text="正在获取用户信息..." /> : null}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarChange}
        style={{ display: 'none' }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div className={styles.pageStack}>
        <section className={styles.heroCard}>
          <div className={styles.heroTop}>
            <button
              type="button"
              className={styles.avatarButton}
              onClick={handleAvatarClick}
              disabled={userLoading || avatarUploading}
            >
              <div className={styles.avatarSurface}>
                {avatar ? (
                  <img className={styles.avatarImg} src={avatar} alt="avatar" loading="lazy" />
                ) : (
                  <svg viewBox="0 0 1024 1024" width="40" height="40">
                    <path d="M512 512m-160 0a160 160 0 1 0 320 0 160 160 0 1 0-320 0Z" fill="#c5beb4" />
                    <path d="M512 704c-123.2 0-224 100.8-224 224h448c0-123.2-100.8-224-224-224z" fill="#c5beb4" />
                  </svg>
                )}
              </div>
            </button>
            <div className={styles.identityBlock}>
              <div className={styles.identityLabel}>个人主页</div>
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
                      <button className={styles.saveBtn} onClick={handleSaveName} disabled={nameSaving}>
                        {nameSaving ? '保存中...' : '保存'}
                      </button>
                      <button className={styles.cancelBtn} onClick={handleCancelEdit} disabled={nameSaving}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className={styles.userNameText}>{userInfo.name || '未命名'}</span>
                    <button type="button" className={styles.inlineIconButton} onClick={handleEditName}>
                      <svg className={styles.editIcon} viewBox="0 0 1024 1024" width="16" height="16">
                        <path d="M257.7 752c2 0 4-.2 6-.5L431.9 722c2-.4 3.9-1.3 5.3-2.8l423.9-423.9c3.9-3.9 3.9-10.2 0-14.1L694.9 114.9c-1.9-1.9-4.4-2.9-7.1-2.9s-5.2 1-7.1 2.9L256.8 538.8c-1.5 1.5-2.4 3.3-2.8 5.3l-29.5 168.2c-1.9 11.1 1.5 21.9 9.4 29.8 6.6 6.4 15.6 9.9 25.8 9.9z" fill="currentColor" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
              <div className={styles.userAccount}>账号 {maskedAccount}</div>
            </div>
          </div>

          <div className={styles.actionRow}>
            <button type="button" className={styles.metaChip} onClick={() => setSexVisible(true)}>
              性别 {genderText}
            </button>
            <button type="button" className={styles.metaChip} onClick={() => setPasswordVisible(true)}>
              修改密码
            </button>
            <button
              type="button"
              className={`${styles.metaChip} ${styles.metaChipDanger}`}
              onClick={() => {
                setConfirmDialogVisible(true)
                Dialog.confirm({
                  message: '确定退出登录吗？',
                  onCancel: () => {
                    setConfirmDialogVisible(false)
                  },
                  onConfirm: () => {
                    setConfirmDialogVisible(false)
                    handleLogout()
                  },
                })
              }}
            >
              退出登录
            </button>
          </div>

          <div className={styles.modelPanel}>
            <div className={styles.modelSummary}>
              <div className={styles.modelInfo}>
                <div className={styles.sectionEyebrow}>个人形象</div>
                <div className={styles.modelTitle}>
                  {hasCharacterModel ? '形象已就绪' : '上传个人形象'}
                </div>
                <div className={styles.modelText}>
                  {hasCharacterModel ? '用于搭配预览与上身展示' : '完成设置后可在搭配页查看上身效果'}
                </div>
              </div>
              <div className={styles.modelActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleUploadClick}
                  disabled={uploading || modelDeleting}
                >
                  {uploading ? '上传中...' : hasCharacterModel ? '重新上传' : '立即上传'}
                </button>
                {hasCharacterModel ? (
                  <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setModelPreviewVisible(true)}
                  disabled={uploading || modelDeleting}
                >
                  管理
                </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panelCard}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>资产概览</div>
              <div className={styles.sectionTitle}>我的资产</div>
            </div>
            <button
              type="button"
              className={styles.sectionAction}
              onClick={() => fetchAssetStats(true)}
              disabled={assetLoading || userLoading}
            >
              {assetLoading ? '刷新中...' : '刷新'}
            </button>
          </div>
          {assetError ? <div className={styles.cardError}>{assetError}</div> : null}
          <div className={styles.statsGrid}>
            {assetCards.map((item) => (
              <button key={item.key} type="button" className={styles.statItem} onClick={item.onClick}>
                <div className={styles.statValue}>{item.value}</div>
                <div className={styles.statLabel}>{item.label}</div>
              </button>
            ))}
          </div>
          <div className={styles.quickGrid}>
            {quickActions.map((item) => (
              <button key={item.key} type="button" className={styles.quickButton} onClick={item.onClick}>
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.panelCard}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.sectionEyebrow}>穿搭档案</div>
              <div className={styles.sectionTitle}>我的档案</div>
            </div>
            <button type="button" className={styles.sectionAction} onClick={openProfilePopup} disabled={userLoading}>
              编辑
            </button>
          </div>
          <div className={styles.profileGrid}>
            {profileSummary.map((item) => (
              <div key={item.key} className={styles.profileItem}>
                <span className={styles.profileLabel}>{item.label}</span>
                <span className={styles.profileValue}>{item.value}</span>
              </div>
            ))}
          </div>
          <div className={styles.profileHint}>仅保存在本机</div>
        </section>
      </div>

      <Popup
        visible={profileVisible}
        closeable
        title="编辑穿搭档案"
        style={{ height: '70%', zIndex: 7000 }}
        position="bottom"
        round
        onClose={closeProfilePopup}
      >
        <div className={styles.profileEditor}>
          <div className={styles.profileEditorScroll}>
            <div className={styles.profileSection}>
              <div className={styles.profileSectionHeader}>
                <div className={styles.profileSectionTitle}>身体数据</div>
                <div className={styles.profileSectionDesc}>用于更贴合的尺码与推荐</div>
              </div>
              <div className={styles.profileGrid2}>
                <div className={styles.profileTile}>
                  <div className={styles.profileTileLabel}>城市</div>
                  <input
                    className={styles.profileTileInput}
                    type="text"
                    inputMode="text"
                    placeholder="例如：抚州"
                    value={profileDraft.city}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div className={styles.profileTile}>
                  <div className={styles.profileTileLabel}>身高(cm)</div>
                  <input
                    className={styles.profileTileInput}
                    type="number"
                    inputMode="numeric"
                    placeholder="例如 170"
                    value={profileDraft.heightCm}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, heightCm: e.target.value }))}
                  />
                </div>
                <div className={styles.profileTile}>
                  <div className={styles.profileTileLabel}>体重(kg)</div>
                  <input
                    className={styles.profileTileInput}
                    type="number"
                    inputMode="numeric"
                    placeholder="例如 60"
                    value={profileDraft.weightKg}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, weightKg: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className={styles.profileSection}>
              <div className={styles.profileSectionHeader}>
                <div className={styles.profileSectionTitle}>尺码</div>
                <div className={styles.profileSectionDesc}>可填常用尺码或国标</div>
              </div>
              <div className={styles.profileGrid3}>
                <button
                  type="button"
                  className={styles.profileTileButton}
                  onClick={() => openSizePicker('topSize')}
                >
                  <div className={styles.profileTileLabel}>上装</div>
                  <div className={styles.profileTileValue}>
                    {profileDraft.topSize ? (
                      profileDraft.topSize
                    ) : (
                      <span className={styles.profileTilePlaceholder}>请选择</span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  className={styles.profileTileButton}
                  onClick={() => openSizePicker('bottomSize')}
                >
                  <div className={styles.profileTileLabel}>下装</div>
                  <div className={styles.profileTileValue}>
                    {profileDraft.bottomSize ? (
                      profileDraft.bottomSize
                    ) : (
                      <span className={styles.profileTilePlaceholder}>请选择</span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  className={styles.profileTileButton}
                  onClick={() => openSizePicker('shoeSize')}
                >
                  <div className={styles.profileTileLabel}>鞋码</div>
                  <div className={styles.profileTileValue}>
                    {profileDraft.shoeSize ? (
                      profileDraft.shoeSize
                    ) : (
                      <span className={styles.profileTilePlaceholder}>请选择</span>
                    )}
                  </div>
                </button>
              </div>
            </div>

            <div className={styles.profileSection}>
              <div className={styles.profileSectionHeader}>
                <div className={styles.profileSectionTitle}>偏好设置</div>
                <div className={styles.profileSectionDesc}>用于解释推荐与搭配思路</div>
              </div>
              <div className={styles.profileStack}>
                <div className={styles.profileTile}>
                  <div className={styles.profileTileLabel}>风格（可多选）</div>
                  <Selector
                    multiple
                    showCheckMark={false}
                    className={styles.chipSelector}
                    columns={PREF_PICKER_META.style.columns}
                    value={splitPreference(profileDraft.style)}
                    options={PREF_PICKER_META.style.options.map((value) => ({ label: value, value }))}
                    onChange={(values) =>
                      setProfileDraft((prev) => ({
                        ...prev,
                        style: joinPreference(values),
                      }))
                    }
                  />
                </div>
                <button
                  type="button"
                  className={styles.profileTileButton}
                  onClick={() => openPrefPicker('colors')}
                >
                  <div className={styles.profileTileLabel}>偏好颜色</div>
                  <div className={styles.profileTileValue}>
                    {profileDraft.colors ? (
                      profileDraft.colors
                    ) : (
                      <span className={styles.profileTilePlaceholder}>请选择</span>
                    )}
                  </div>
                </button>
                <div className={styles.profileTile}>
                  <div className={styles.profileTileLabel}>常用场景（可多选）</div>
                  <Selector
                    multiple
                    showCheckMark={false}
                    className={styles.chipSelector}
                    columns={PREF_PICKER_META.scenes.columns}
                    value={splitPreference(profileDraft.scenes)}
                    options={PREF_PICKER_META.scenes.options.map((value) => ({ label: value, value }))}
                    onChange={(values) =>
                      setProfileDraft((prev) => ({
                        ...prev,
                        scenes: joinPreference(values),
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={styles.profileEditorFooter}>
            <button type="button" className={styles.profileSaveBtn} onClick={handleSaveProfile}>
              保存
            </button>
          </div>
        </div>
      </Popup>

      <Popup
        visible={sizePickerVisible}
        closeable
        title={SIZE_PICKER_META[activeSizeField]?.title || '选择'}
        position="bottom"
        round
        style={{ height: '45%', zIndex: 7000 }}
        onClose={closeSizePicker}
      >
        <div className={styles.profilePickerBody}>
          <Picker
            value={sizePickerValue}
            columns={uniqStrings([
              String(profileDraft?.[activeSizeField] || '').trim(),
              ...(SIZE_PICKER_META[activeSizeField]?.options || []),
            ]).filter(Boolean)}
            onChange={(value) => setSizePickerValue(value)}
            onCancel={closeSizePicker}
            onConfirm={(value) => confirmSizePicker(value)}
          />
        </div>
      </Popup>

      <Popup
        visible={prefPickerVisible}
        closeable
        title={PREF_PICKER_META[activePrefField]?.title || '选择'}
        position="bottom"
        round
        style={{ zIndex: 7000 }}
        onClose={closePrefPicker}
      >
        <div className={styles.profilePickerBody}>
          <div className={styles.profilePickerHint}>可多选，点击切换</div>
          <Selector
            multiple
            showCheckMark={false}
            className={styles.chipSelector}
            columns={PREF_PICKER_META[activePrefField]?.columns || 3}
            value={prefSelected}
            options={uniqStrings([
              ...splitPreference(String(profileDraft?.[activePrefField] || '').trim()),
              ...(PREF_PICKER_META[activePrefField]?.options || []),
            ]).map((value) => ({ label: value, value }))}
            onChange={(value) => setPrefSelected(value)}
          />
          <div className={styles.profilePickerFooter}>
            <button type="button" className={styles.profilePickerCancel} onClick={closePrefPicker}>
              取消
            </button>
            <button type="button" className={styles.profilePickerConfirm} onClick={confirmPrefPicker}>
              确定
            </button>
          </div>
        </div>
      </Popup>

      <Popup
        visible={modelPreviewVisible}
        closeable
        title="形象照预览"
        style={{ height: '75%' }}
        position="bottom"
        round
        onClose={() => setModelPreviewVisible(false)}
      >
        <div className={styles.modelPreviewBody}>
          <div className={styles.modelPreviewImage}>
            {uploadedImage ? <img src={uploadedImage} alt="形象照预览" loading="lazy" /> : null}
          </div>
          <div className={styles.modelPreviewActions}>
            <button
              type="button"
              className={styles.modelActionBtn}
              onClick={handleUploadClick}
              disabled={uploading || modelDeleting}
            >
              {uploading ? '上传中...' : '重新上传'}
            </button>
            <button
              type="button"
              className={styles.modelDeleteBtn}
              onClick={handleDeleteCharacterModel}
              disabled={uploading || modelDeleting}
            >
              删除
            </button>
          </div>
        </div>
      </Popup>

      <Popup
        visible={passwordVisible}
        closeable
        style={{ height: '45%' }}
        position="bottom"
        title="修改密码"
        round
        onClose={() => {
          if (passwordSaving) return
          closePasswordPopup()
        }}
      >
        <div className={styles.passwordInput}>
          <input
            type="password"
            placeholder="请输入旧密码"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
          />
          <input
            type="password"
            placeholder="请输入新密码"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            type="password"
            placeholder="请确认新密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button onClick={handlePasswordChange} disabled={passwordSaving}>
            {passwordSaving ? '修改中...' : '确认修改'}
          </button>
        </div>
      </Popup>

      <Popup
        visible={sexVisible}
        closeable
        title="请选择您的性别"
        style={{ height: '30%' }}
        position="bottom"
        round
        onClose={() => setSexVisible(false)}
      >
        <div className={styles.genderOptions}>
          <div
            className={`${styles.genderOption} ${sex === 'man' ? styles.active : ''}`}
            onClick={() => handleSexChange('man')}
          >
            男
          </div>
          <div
            className={`${styles.genderOption} ${sex === 'woman' ? styles.active : ''}`}
            onClick={() => handleSexChange('woman')}
          >
            女
          </div>
        </div>
      </Popup>
    </div>
  )
}
