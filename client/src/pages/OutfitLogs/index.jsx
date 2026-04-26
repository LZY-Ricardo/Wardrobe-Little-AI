import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Toast } from 'antd-mobile'
import axios from '@/api'
import { buildAgentContextState, createFocusReader } from '@/utils/agentContext'
import useAgentPageEntry from '@/hooks/useAgentPageEntry'
import { useClosetStore } from '@/store'
import { Empty, ErrorBanner, Loading } from '@/components/Feedback'
import { getTodayInChina } from '@/utils/date'
import { buildReturnTargetAttr, resolveReturnEntityId, useReturnScroll } from '@/utils/returnNavigation'
import { useLocation, useNavigate } from 'react-router-dom'
import { buildOutfitLogsViewModel } from './viewModel'
import { buildSelectionViewModel } from './selectionViewModel'
import styles from './index.module.less'

const today = () => getTodayInChina()

export default function OutfitLogs() {
  const navigate = useNavigate()
  const location = useLocation()
  const fetchAllClothes = useClosetStore((s) => s.fetchAllClothes)
  const [logs, setLogs] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [clothes, setClothes] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [itemKeyword, setItemKeyword] = useState('')
  const [showAllItems, setShowAllItems] = useState(false)
  const highlightedLogId = resolveReturnEntityId(location.state, [
    createFocusReader('outfitLog'),
    (state) => state.selectedOutfitLog,
  ])
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

  useReturnScroll({ prefix: 'outfit-log', id: highlightedLogId, watch: logs.length })

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

  const canDraftToAgent = form.items.length > 0
  useAgentPageEntry(
    canDraftToAgent
      ? {
          presetTask: `帮我记录这套${form.scene || '今日'}穿搭`,
          state: buildAgentContextState({
            draft: {
              type: 'outfitLog',
              entity: {
                ...form,
                source: 'agent',
              },
            },
            latestTask: {
              manualOutfitLogDraft: {
                ...form,
                source: 'agent',
              },
            },
          }),
        }
      : {
          presetTask: '帮我看看最近的穿搭记录',
        }
  )
  const viewModel = buildOutfitLogsViewModel({ form, logs, clothes })
  const selectionModel = useMemo(
    () =>
      buildSelectionViewModel({
        clothes,
        selectedIds: form.items,
        activeCategory,
        keyword: itemKeyword,
        visibleCount: showAllItems ? 99 : 6,
      }),
    [activeCategory, clothes, form.items, itemKeyword, showAllItems]
  )

  const handleCategoryChange = (categoryKey) => {
    setActiveCategory(categoryKey)
    setShowAllItems(false)
  }

  const handleKeywordChange = (value) => {
    setItemKeyword(value)
    setShowAllItems(false)
  }

  if (status === 'loading') return <Loading text="加载穿搭记录中..." />
  if (status === 'error') return <ErrorBanner message={error} onAction={loadLogs} />

  return (
    <div className={styles.page}>
      <section className={styles.heroCard}>
        <div className={styles.heroTop}>
          <div className={styles.heroText}>
            <div className={styles.pageTitle}>记录穿搭</div>
            <div className={styles.pageSubtitle}>{viewModel.heroHint}</div>
          </div>
        </div>
        <div className={styles.todayCard}>
          <div className={styles.todayCardLabel}>今日记录</div>
          <div className={styles.todayCardText}>{viewModel.todaySummary}</div>
        </div>
      </section>

      <section className={styles.formGrid}>
        <label className={styles.fieldCard}>
          <span className={styles.fieldLabel}>日期</span>
          <input
            className={styles.fieldInput}
            type="date"
            value={form.logDate}
            onChange={(e) => setForm((prev) => ({ ...prev, logDate: e.target.value }))}
          />
        </label>
        <label className={styles.fieldCard}>
          <span className={styles.fieldLabel}>场景</span>
          <input
            className={styles.fieldInput}
            type="text"
            placeholder="如 通勤 / 面试 / 约会"
            value={form.scene}
            onChange={(e) => setForm((prev) => ({ ...prev, scene: e.target.value }))}
          />
        </label>
        <label className={styles.fieldCard}>
          <span className={styles.fieldLabel}>天气</span>
          <input
            className={styles.fieldInput}
            type="text"
            placeholder="如 晴 22°C"
            value={form.weatherSummary}
            onChange={(e) => setForm((prev) => ({ ...prev, weatherSummary: e.target.value }))}
          />
        </label>
        <label className={styles.fieldCard}>
          <span className={styles.fieldLabel}>满意度</span>
          <input
            className={styles.fieldInput}
            type="number"
            min="0"
            max="5"
            value={form.satisfaction}
            onChange={(e) => setForm((prev) => ({ ...prev, satisfaction: e.target.value }))}
          />
        </label>
      </section>

      <section className={styles.noteCard}>
        <div className={styles.fieldLabel}>备注</div>
        <textarea
          className={styles.noteInput}
          placeholder="记录今天这套搭配的感受"
          value={form.note}
          onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
        />
      </section>

      <section className={styles.selectorCard}>
        <div className={styles.selectorHeader}>
          <div className={styles.sectionTitle}>选择单品</div>
          <div className={styles.selectorCount}>已选 {viewModel.selectedCount} 件</div>
        </div>
        <div className={styles.selectorToolbar}>
          <input
            className={styles.selectorSearch}
            type="search"
            placeholder="搜索单品"
            value={itemKeyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
          />
        </div>
        {selectionModel.selectedItems.length ? (
          <div className={styles.selectedSummary}>
            <div className={styles.selectedSummaryLabel}>已选单品</div>
            <div className={styles.selectedChipRow}>
              {selectionModel.selectedItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.selectedChip}
                  onClick={() => toggleItem(item.id)}
                >
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className={styles.categoryTabs}>
          {selectionModel.categories.map((category) => (
            <button
              key={category.key}
              type="button"
              className={`${styles.categoryTab} ${category.active ? styles.categoryTabActive : ''}`}
              onClick={() => handleCategoryChange(category.key)}
            >
              <span>{category.label}</span>
              <small>{category.count}</small>
            </button>
          ))}
        </div>
        {selectionModel.visibleItems.length ? (
          <div className={styles.selectorWrap}>
            {selectionModel.visibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.selector} ${item.selected ? styles.selectorActive : ''}`}
                onClick={() => toggleItem(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.meta || item.category}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.selectorEmpty}>{selectionModel.emptyText}</div>
        )}
        {selectionModel.hasMore ? (
          <button type="button" className={styles.moreButton} onClick={() => setShowAllItems(true)}>
            展开更多
          </button>
        ) : null}
      </section>

      <Button className={styles.saveButton} color="primary" loading={saving} onClick={handleCreate}>
        保存穿搭记录
      </Button>

      <section className={styles.historyCard}>
        <div className={styles.historyHeader}>
          <div className={styles.sectionTitle}>最近记录</div>
          <div className={styles.historyMeta}>最近 3 条</div>
        </div>
        {!viewModel.recentLogs.length ? (
          <Empty description="还没有穿搭记录" />
        ) : (
          <div className={styles.historyList}>
            {viewModel.recentLogs.map((item) => (
              <div
                className={`${styles.historyItem} ${highlightedLogId === item.id ? styles.logItemHighlighted : ''}`}
                key={item.id}
                data-return-target={buildReturnTargetAttr('outfit-log', item.id)}
              >
                <div className={styles.historyDate}>{item.log_date}</div>
                <div className={styles.historyLine}>
                  {[item.scene, item.weather_summary].filter(Boolean).join(' · ')}
                </div>
                <div className={styles.historyLineMuted}>
                  {(item.items || []).map((cloth) => cloth.name || cloth.type).filter(Boolean).join('、')}
                  {item.satisfaction ? ` · 满意度 ${item.satisfaction}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.listCard}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitle}>全部历史</div>
        </div>
        {!logs.length ? (
          <Empty description="还没有穿搭记录" />
        ) : (
          <div className={styles.list}>
            {logs.map((item) => (
              <div
                className={`${styles.logItem} ${highlightedLogId === item.id ? styles.logItemHighlighted : ''}`}
                key={item.id}
                data-return-target={buildReturnTargetAttr('outfit-log', item.id)}
              >
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
                    className={styles.logAgentButton}
                    size="mini"
                    fill="outline"
                    onClick={() =>
                      navigate('/unified-agent', {
                        state: buildAgentContextState({
                          presetTask: `帮我处理这条穿搭记录：${item.log_date}`,
                          focus: {
                            type: 'outfitLog',
                            entity: item,
                          },
                        }),
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
      </section>
    </div>
  )
}
