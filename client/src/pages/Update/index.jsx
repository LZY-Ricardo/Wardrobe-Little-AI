import React, { useEffect, useRef, useState } from 'react'
import styles from './index.module.less'
import SvgIcon from '@/components/SvgIcon'
import { Button, Dialog, Toast } from 'antd-mobile'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from '@/api'
import { blobToBase64, compressImage, formatFileSize } from '@/utils/imageUtils'
import { normalizeClothesTypeInput, REQUIRED_CLOTHES_TYPES } from '@/utils/clothesType'

const VALID_TYPES = REQUIRED_CLOTHES_TYPES
const MIN_FILE_SIZE = 5 * 1024
const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_STORE_SIZE = 1 * 1024 * 1024
const COMPRESS_CONFIG = { quality: 0.8, maxWidth: 600, maxHeight: 600 }
const UPLOAD_TIMEOUT = 20000

export default function Update() {
  const navigate = useNavigate()
  const { state: selectedItem } = useLocation()

  const [imageUrl, setImageUrl] = useState(selectedItem?.image || '')
  const [status, setStatus] = useState('')
  const [compressing, setCompressing] = useState(false)
  const [, setOriginalSize] = useState(0)
  const [, setCompressedSize] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [analysisUnavailable, setAnalysisUnavailable] = useState(false)
  const [uploadController, setUploadController] = useState(null)
  const [analysisController, setAnalysisController] = useState(null)

  const nameRef = useRef(null)
  const fileRef = useRef(null)
  const typeRef = useRef(null)
  const colorRef = useRef(null)
  const styleRef = useRef(null)
  const seasonRef = useRef(null)
  const materialRef = useRef(null)
  const favoriteRef = useRef(null)

  useEffect(() => {
    if (selectedItem) {
      nameRef.current.value = selectedItem.name || ''
      typeRef.current.value = selectedItem.type || ''
      colorRef.current.value = selectedItem.color || ''
      styleRef.current.value = selectedItem.style || ''
      seasonRef.current.value = selectedItem.season || ''
      materialRef.current.value = selectedItem.material || ''
      favoriteRef.current.value = String(selectedItem.favorite ?? '0')
      setImageUrl(selectedItem.image || '')
    }
  }, [selectedItem])

  const handleImageChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      Toast.show({ icon: 'fail', content: '请上传图片文件', duration: 1200 })
      return
    }

    if (file.size < MIN_FILE_SIZE) {
      Toast.show({ icon: 'fail', content: '图片大小不能小于 5KB', duration: 1200 })
      return
    }

    setCompressing(true)
    setOriginalSize(file.size)
    setAnalysisUnavailable(false)

    try {
      const compressedBlob = await compressImage(
        file,
        COMPRESS_CONFIG.quality,
        COMPRESS_CONFIG.maxWidth,
        COMPRESS_CONFIG.maxHeight
      )
      setCompressedSize(compressedBlob.size)
      if (compressedBlob.size > MAX_STORE_SIZE) {
        Toast.show({ icon: 'fail', content: '压缩后仍超过 1MB，请换更小的图片', duration: 1500 })
        setCompressing(false)
        return
      }
      const base64 = await blobToBase64(compressedBlob)
      setImageUrl(base64)

      const compressionRatio = ((file.size - compressedBlob.size) / file.size * 100).toFixed(1)
      console.log('图片压缩完成', {
        原始大小: formatFileSize(file.size),
        压缩后大小: formatFileSize(compressedBlob.size),
        压缩比例: `${compressionRatio}%`,
      })
    } catch (error) {
      console.error('图片压缩失败:', error)
      Toast.show({ icon: 'fail', content: '图片处理失败，请重试', duration: 1200 })
    } finally {
      setCompressing(false)
    }
  }

  const analyzeClothes = async () => {
    if (!imageUrl) {
      Toast.show({ icon: 'fail', content: '请上传需要更新的衣物图片', duration: 1200 })
      return
    }

    setStatus('小助手分析中，请稍候...')
    setAnalysisUnavailable(false)
    const controller = new AbortController()
    setAnalysisController(controller)

    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const file = new File([blob], 'compressed-image.jpg', { type: 'image/jpeg' })
      const formData = new FormData()
      formData.append('image', file)

      const res = await axios.post('/clothes/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: controller.signal,
        timeout: UPLOAD_TIMEOUT,
      })

      if (res.code !== 1) {
        throw new Error(res.msg || '分析失败')
      }

      const data = JSON.parse(res.data)
      const normalizedType = normalizeClothesTypeInput(data.type || '')
      typeRef.current.value = normalizedType.value
      colorRef.current.value = data.color || ''
      styleRef.current.value = data.style || ''
      seasonRef.current.value = data.season || ''
      materialRef.current.value = data.material || ''

      Toast.show({ icon: 'success', content: '分析完成', duration: 1200 })
    } catch (error) {
      if (error.name === 'AbortError') {
        Toast.show({ icon: 'fail', content: '已取消分析', duration: 1000 })
      } else {
        console.error('分析衣物错误:', error)
        setAnalysisUnavailable(true)
        Toast.show({ icon: 'fail', content: '分析不可用，请手动填写', duration: 1500 })
      }
    } finally {
      setStatus('')
      setAnalysisController(null)
    }
  }

  const cancelAnalysis = () => {
    if (analysisController) {
      analysisController.abort()
    }
  }

  const applyTypeNormalization = (value, notify = false) => {
    const normalized = normalizeClothesTypeInput(value)
    if (normalized.value && normalized.value !== value) {
      typeRef.current.value = normalized.value
      if (notify && normalized.added) {
        Toast.show({ icon: 'success', content: `已自动补充类型：${normalized.added}`, duration: 1200 })
      }
    }
    return normalized.value || value
  }

  const handleTypeBlur = () => {
    if (!typeRef.current) return
    applyTypeNormalization(typeRef.current.value, true)
  }

  const validateForm = () => {
    if (!nameRef.current.value) {
      Toast.show({ icon: 'fail', content: '请输入衣物名称', duration: 1200 })
      return false
    }
    if (!typeRef.current.value) {
      Toast.show({ icon: 'fail', content: '请输入衣物类型', duration: 1200 })
      return false
    }
    applyTypeNormalization(typeRef.current.value, true)
    const hasValidType = VALID_TYPES.some((type) => typeRef.current.value.includes(type))
    if (!hasValidType) {
      Toast.show({ icon: 'fail', content: '衣物类型需包含：上衣/下衣/鞋子/配饰', duration: 1800 })
      return false
    }
    if (!colorRef.current.value) {
      Toast.show({ icon: 'fail', content: '请输入衣物颜色', duration: 1200 })
      return false
    }
    if (!styleRef.current.value) {
      Toast.show({ icon: 'fail', content: '请输入衣物风格', duration: 1200 })
      return false
    }
    if (!seasonRef.current.value) {
      Toast.show({ icon: 'fail', content: '请输入适宜季节', duration: 1200 })
      return false
    }
    return true
  }

  const handleUpdateCloth = async () => {
    if (!selectedItem?.cloth_id) {
      Toast.show({ icon: 'fail', content: '缺少衣物标识，无法更新', duration: 1500 })
      return
    }
    if (!validateForm()) return

    setUploading(true)
    const controller = new AbortController()
    setUploadController(controller)

    try {
      const res = await axios.put(
        `/clothes/${selectedItem.cloth_id}`,
        {
          name: nameRef.current.value,
          type: typeRef.current.value,
          color: colorRef.current.value,
          style: styleRef.current.value,
          season: seasonRef.current.value,
          material: materialRef.current.value || '',
          image: imageUrl,
          favorite: parseInt(favoriteRef.current.value, 10) || 0,
        },
        {
          signal: controller.signal,
          timeout: UPLOAD_TIMEOUT,
        }
      )

      if (res.code !== 1) {
        throw new Error(res.msg || '更新失败')
      }

      Toast.show({ icon: 'success', content: '更新成功', duration: 1200 })
      setTimeout(() => navigate(-1), 800)
    } catch (error) {
      if (error.name === 'AbortError') {
        Toast.show({ icon: 'fail', content: '已取消更新', duration: 1200 })
      } else {
        console.error('更新衣物失败:', error)
        Toast.show({ icon: 'fail', content: '更新失败，请重试', duration: 1500 })
      }
    } finally {
      setUploading(false)
      setUploadController(null)
    }
  }

  const cancelUpload = () => {
    if (uploadController) {
      uploadController.abort()
    }
  }

  return (
    <div className={styles.add}>
      <div className={styles.header}>
        <div className={styles.headerBack} onClick={() => navigate(-1)}>
          <SvgIcon iconName="icon-fanhui" />
        </div>
        <div className={styles.headerTitle}>更新衣物</div>
        <div
          className={styles.headerQuestion}
          onClick={() =>
            Dialog.alert({
              content: '请上传单件衣物的清晰照片，背景越简洁越好，以便识别。',
            })
          }
        >
          <SvgIcon iconName="icon-qm" />
        </div>
      </div>

      <div className={styles.container}>
        <div className={styles.name}>
          <label htmlFor="name">衣物名称</label>
          <input ref={nameRef} type="text" id="name" placeholder="请输入衣物名称" />
        </div>

        <div className={styles.img}>
          <label htmlFor="img" className={styles.uploadBox}>
            {imageUrl ? (
              <div className={styles.imageContainer}>
                <img src={imageUrl} alt="预览" className={styles.previewImg} loading="lazy" />
              </div>
            ) : (
              <div className={styles.uploadContent}>
                <SvgIcon iconName="icon-shangchuantupian" className={styles.cameraIcon} />
                <div className={styles.uploadText}>
                  <p>点击上传图片</p>
                  <p className={styles.uploadTip}>建议单件衣物，光线充足便于识别</p>
                  <p className={styles.uploadTip}>图片将自动压缩以提升性能</p>
                </div>
              </div>
            )}
            {compressing && (
              <div className={styles.statusOverlay}>
                <div className={styles.loadingSpinner}></div>
                <span>正在压缩图片...</span>
              </div>
            )}
            {status && <div className={styles.statusOverlay}>{status}</div>}
          </label>
          <input
            ref={fileRef}
            type="file"
            id="img"
            className={styles.fileInput}
            accept="image/*"
            capture="camera"
            onChange={handleImageChange}
          />
          {analysisUnavailable && (
            <div className={styles.helperText}>分析不可用，请手动填写信息</div>
          )}
        </div>

        <div className={styles.analyzeBtn}>
          <Button color="success" onClick={analyzeClothes} disabled={!imageUrl || compressing}>
            分析衣物
          </Button>
          {analysisController ? (
            <Button color="warning" onClick={cancelAnalysis} style={{ marginLeft: 8 }}>
              取消分析
            </Button>
          ) : null}
        </div>

        <div className={styles.detail}>
          <div className={styles.detailType}>
            <label htmlFor="type">衣物类型</label>
            <input
              ref={typeRef}
              type="text"
              id="type"
              placeholder="如：上衣/下衣/鞋子/配饰"
              onBlur={handleTypeBlur}
            />
          </div>
          <div className={styles.detailColor}>
            <label htmlFor="color">衣物颜色</label>
            <input ref={colorRef} type="text" id="color" placeholder="请输入颜色" />
          </div>
          <div className={styles.detailStyle}>
            <label htmlFor="style">衣物风格</label>
            <input ref={styleRef} type="text" id="style" placeholder="如：通勤/休闲/运动" />
          </div>
          <div className={styles.detailSeason}>
            <label htmlFor="season">季节</label>
            <input ref={seasonRef} type="text" id="season" placeholder="请输入适宜季节" />
          </div>
          <div className={styles.detailMaterial}>
            <label htmlFor="material">衣物材质</label>
            <input ref={materialRef} type="text" id="material" placeholder="选填，如：棉/羊毛" />
          </div>
          <div className={styles.detailFavorite}>
            <label htmlFor="favorite">是否收藏</label>
            <select ref={favoriteRef} id="favorite">
              <option value="1">收藏</option>
              <option value="0">未收藏</option>
            </select>
          </div>
        </div>

        <div className={styles.submit}>
          <Button
            color="primary"
            block
            onClick={handleUpdateCloth}
            loading={uploading}
            disabled={uploading}
          >
            确认更新衣物信息
          </Button>
          {uploadController ? (
            <Button color="warning" block onClick={cancelUpload} style={{ marginTop: 8 }}>
              取消更新
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
