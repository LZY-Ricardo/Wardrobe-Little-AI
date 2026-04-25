import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Toast } from 'antd-mobile'
import axios from '@/api'
import { useClosetStore } from '@/store'
import { Empty, ErrorBanner, Loading } from '@/components/Feedback'
import { getTodayInChina } from '@/utils/date'
import { useNavigate } from 'react-router-dom'
import styles from './index.module.less'

const today = () => getTodayInChina()

export default function OutfitLogs() {
  const navigate = useNavigate()
  const fetchAllClothes = useClosetStore((s) => s.fetchAllClothes)
  const [logs, setLogs] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [clothes, setClothes] = useState([])
  const [form, setForm] = useState({
    logDate: today(),
    scene: '',
    weatherSummary: '',
    satisfaction: 3,
    note: '',
    items: [],
  })

  const loadLogs = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const [history, closet] = await Promise.all([
        axios.get('/outfit-logs'),
        fetchAllClothes(),
      ])
      setLogs(Array.isArray(history?.data) ? history.data : [])
      setClothes(Array.isArray(closet) ? closet : [])
      setStatus('success')
    } catch (err) {
      console.error('加载穿搭记录失败:', err)
      setError('加载穿搭记录失败，请稍后重试')
      setStatus('error')
    }
  }, [fetchAllClothes])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  const selectedCount = form.items.length
  const sortedClothes = useMemo(
    () => [...clothes].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite))),
    [clothes]
  )

  const toggleItem = (clothId) => {
    setForm((prev) => {
      const has = prev.items.includes(clothId)
      return {
        ...prev,
        items: has ? prev.items.filter((item) => item !== clothId) : [...prev.items, clothId],
      }
    })
  }

  const handleCreate = async () => {
    if (!form.items.length) {
      Toast.show({ content: '请至少选择 1 件单品', duration: 1000 })
      return
    }
    setSaving(true)
    try {
      const res = await axios.post('/outfit-logs', form)
      const next = res?.data
      setLogs((prev) => [next, ...prev])
      setForm({
        logDate: today(),
        scene: '',
        weatherSummary: '',
        satisfaction: 3,
        note: '',
        items: [],
      })
      Toast.show({ content: '已记录今日穿搭', duration: 1000 })
    } catch (err) {
      console.error('创建穿搭记录失败:', err)
      Toast.show({ content: err?.msg || '创建失败，请重试', duration: 1200 })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (logId) => {
    try {
      await axios.delete(`/outfit-logs/${logId}`)
      setLogs((prev) => prev.filter((item) => item.id !== logId))
      Toast.show({ content: '已删除', duration: 900 })
    } catch (err) {
      console.error('删除穿搭记录失败:', err)
      Toast.show({ content: '删除失败，请重试', duration: 1200 })
    }
  }

  if (status === 'loading') return <Loading text="加载穿搭记录中..." />
  if (status === 'error') return <ErrorBanner message={error} onAction={loadLogs} />

  const canDraftToAgent = form.items.length > 0

  return (
    <div className={styles.page}>
      <div className={styles.formCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>记录穿搭</div>
          <Button
            size="small"
            fill="outline"
            disabled={!canDraftToAgent}
            onClick={() =>
              navigate('/unified-agent', {
                state: {
                  presetTask: `帮我记录这套${form.scene || '今日'}穿搭`,
                  latestResult: {
                    manualOutfitLogDraft: {
                      ...form,
                      source: 'agent',
                    },
                  },
                },
              })
            }
          >
            交给 Agent
          </Button>
        </div>
        <div className={styles.grid}>
          <label className={styles.field}>
            <span>日期</span>
            <input
              type="date"
              value={form.logDate}
              onChange={(e) => setForm((prev) => ({ ...prev, logDate: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>场景</span>
            <input
              type="text"
              placeholder="如 通勤 / 面试 / 约会"
              value={form.scene}
              onChange={(e) => setForm((prev) => ({ ...prev, scene: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>天气</span>
            <input
              type="text"
              placeholder="如 晴 22°C"
              value={form.weatherSummary}
              onChange={(e) => setForm((prev) => ({ ...prev, weatherSummary: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>满意度</span>
            <input
              type="number"
              min="0"
              max="5"
              value={form.satisfaction}
              onChange={(e) => setForm((prev) => ({ ...prev, satisfaction: e.target.value }))}
            />
          </label>
        </div>

        <label className={styles.field}>
          <span>备注</span>
          <textarea
            placeholder="记录今天这套搭配的感受"
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
          />
        </label>

        <div className={styles.sectionSubTitle}>选择单品</div>
        <div className={styles.selectorWrap}>
          {sortedClothes.map((item) => {
            const selected = form.items.includes(item.cloth_id)
            return (
              <button
                key={item.cloth_id}
                type="button"
                className={`${styles.selector} ${selected ? styles.selectorActive : ''}`}
                onClick={() => toggleItem(item.cloth_id)}
              >
                <span>{item.name || item.type}</span>
                <small>{[item.type, item.color, item.style].filter(Boolean).join(' · ')}</small>
              </button>
            )
          })}
        </div>

        <div className={styles.formFooter}>
          <div className={styles.selectedText}>已选 {selectedCount} 件</div>
          <Button color="primary" loading={saving} onClick={handleCreate}>
            保存穿搭记录
          </Button>
        </div>
      </div>

      <div className={styles.listCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>穿搭历史</div>
          <Button
            size="small"
            fill="outline"
            onClick={() => navigate('/unified-agent', { state: { presetTask: '帮我看看最近的穿搭记录' } })}
          >
            交给 Agent
          </Button>
        </div>
        {!logs.length ? (
          <Empty description="还没有穿搭记录" />
        ) : (
          <div className={styles.list}>
            {logs.map((item) => (
              <div className={styles.logItem} key={item.id}>
                <div className={styles.logHeader}>
                  <div>
                    <div className={styles.logDate}>{item.log_date}</div>
                    <div className={styles.logMeta}>
                      {[item.scene, item.weather_summary, `满意度 ${item.satisfaction}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    onClick={() => handleDelete(item.id)}
                  >
                    删除
                  </button>
                </div>
                <div className={styles.logActions}>
                  <Button
                    size="mini"
                    fill="outline"
                    onClick={() =>
                      navigate('/unified-agent', {
                        state: {
                          presetTask: `帮我处理这条穿搭记录：${item.log_date}`,
                          selectedOutfitLog: item,
                        },
                      })
                    }
                  >
                    交给 Agent
                  </Button>
                </div>
                {item.note ? <div className={styles.note}>{item.note}</div> : null}
                <div className={styles.tags}>
                  {(item.items || []).map((cloth) => (
                    <span key={`${item.id}-${cloth.cloth_id}`} className={styles.tag}>
                      {cloth.name || cloth.type}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
