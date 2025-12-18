import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Toast } from 'antd-mobile'
import { useNavigate } from 'react-router-dom'
import axios from '@/api'
import { extractClothIds, toSuitSignature } from '@/utils/suitSignature'
import { buildAutoSuitName } from '@/utils/suitName'
import { useUiStore } from '@/store'
import styles from './index.module.less'

const MIN_ITEMS = 2
const MAX_ITEMS = 6
const SCENE_PRESETS = ['通勤', '约会', '运动', '商务', '旅行', '聚会']

const SuitCreate = () => {
  const navigate = useNavigate()
  const setAiEntranceHidden = useUiStore((s) => s.setAiEntranceHidden)
  const [name, setName] = useState('')
  const [scene, setScene] = useState('')
  const [description, setDescription] = useState('')
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState([])

  const selectedCount = selected.length

  const loadClothes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/clothes/all')
      setItems(Array.isArray(res?.data) ? res.data : [])
    } catch (err) {
      Toast.show({ content: err?.msg || '获取衣物失败', duration: 1200 })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadClothes()
  }, [loadClothes])

  useEffect(() => {
    setAiEntranceHidden(true)
    return () => setAiEntranceHidden(false)
  }, [setAiEntranceHidden])

  const toggleSelect = (clothId) => {
    setSelected((prev) => {
      if (prev.includes(clothId)) return prev.filter((id) => id !== clothId)
      if (prev.length >= MAX_ITEMS) {
        Toast.show({ content: `最多选择 ${MAX_ITEMS} 件单品`, duration: 1200 })
        return prev
      }
      return [...prev, clothId]
    })
  }

  const handleSubmit = async () => {
    if (saving) return
    const clothIds = extractClothIds(selected)
    if (clothIds.length < MIN_ITEMS) {
      Toast.show({ content: `请至少选择 ${MIN_ITEMS} 件单品`, duration: 1200 })
      return
    }

    const autoName = buildAutoSuitName(scene)
    const payload = {
      name: name.trim() || autoName,
      scene: scene.trim(),
      description: description.trim(),
      items: clothIds,
      source: 'manual',
    }

    setSaving(true)
    try {
      await axios.post('/suits', payload)
      Toast.show({ content: '套装已保存', duration: 1000 })
      navigate('/match?tab=collection', { replace: true })
    } catch (err) {
      Toast.show({ content: err?.msg || '保存失败，请重试', duration: 1200 })
    } finally {
      setSaving(false)
    }
  }

  const selectedClothes = useMemo(
    () => items.filter((item) => selected.includes(item.cloth_id)),
    [items, selected]
  )

  const renderItems = useMemo(() => {
    if (loading) return <div className={styles.hint}>加载衣橱中...</div>
    if (!items.length) {
      return (
        <div className={styles.hint}>
          衣橱为空，请先添加衣物
          <button type="button" onClick={() => navigate('/add')}>去添加</button>
        </div>
      )
    }
    return (
      <div className={styles.grid}>
        {items.map((item) => {
          const active = selected.includes(item.cloth_id)
          const disabled = !active && selected.length >= MAX_ITEMS
          return (
            <div
              key={item.cloth_id}
              className={`${styles.tile} ${active ? styles.tileActive : ''} ${disabled ? styles.tileDisabled : ''}`}
              onClick={() => toggleSelect(item.cloth_id)}
            >
              <div className={styles.tileImg}>
                {item.image ? <img src={item.image} alt={item.name || '单品'} loading="lazy" /> : <div className={styles.tilePlaceholder}>无图</div>}
                {active ? <div className={styles.tileCheck}>✓</div> : null}
              </div>
              <div className={styles.tileInfo}>
                <div className={styles.tileName}>{item.name || '单品'}</div>
                <div className={styles.tileMeta} title={[item.type, item.color, item.style].filter(Boolean).join(' · ')}>
                  {[item.type, item.color, item.style].filter(Boolean).slice(0, 2).join(' · ')}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }, [items, loading, navigate, selected])

  const signature = toSuitSignature(selected)

  return (
    <div className={styles.create}>
      <div className={styles.header}>
        <div className={styles.title}>新建套装</div>
        <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
          返回
        </button>
      </div>

      <div className={styles.form}>
        <label>
          <span>套装名称</span>
          <input
            type="text"
            placeholder="例如：周五通勤穿搭"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
          />
        </label>
        <div className={styles.sceneRow}>
          <div className={styles.sceneChips}>
            {SCENE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`${styles.chip} ${scene === preset ? styles.chipActive : ''}`}
                onClick={() => setScene(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="其它场景，自定义填写"
            value={scene}
            onChange={(e) => setScene(e.target.value)}
            maxLength={32}
          />
        </div>
        <div className={styles.descriptionRow}>
          <button type="button" className={styles.descriptionToggle} onClick={() => setDescriptionExpanded((v) => !v)}>
            {descriptionExpanded ? '收起描述' : '添加描述（可选）'}
          </button>
          {descriptionExpanded ? (
            <textarea
              placeholder="备注搭配思路或场景"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={120}
              rows={3}
            />
          ) : null}
        </div>
      </div>

      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>
          选择单品 <span className={styles.count}>({selectedCount}/{MAX_ITEMS})</span>
        </div>
        <div className={styles.sectionDesc}>至少选择 {MIN_ITEMS} 件，自动去重</div>
      </div>

      <div className={styles.items}>{renderItems}</div>

      <div className={styles.footer}>
        <div className={styles.previewBar}>
          {selectedClothes.length ? (
            selectedClothes.map((item) => (
              <button
                key={item.cloth_id}
                type="button"
                className={styles.previewThumb}
                onClick={() => toggleSelect(item.cloth_id)}
                title="点击取消选择"
              >
                {item.image ? <img src={item.image} alt={item.name || '单品'} /> : <span>无图</span>}
              </button>
            ))
          ) : (
            <div className={styles.previewEmpty}>已选 {selectedCount}/{MAX_ITEMS}</div>
          )}
        </div>
        <div className={styles.signature}>组合签名：{signature || '--'}</div>
        <button type="button" className={styles.submit} onClick={handleSubmit} disabled={saving}>
          {saving ? '保存中...' : '保存到套装库'}
        </button>
      </div>
    </div>
  )
}

export default SuitCreate
