import React, { useCallback, useEffect, useMemo } from 'react'
import { Dialog } from 'react-vant'
import { Toast } from 'antd-mobile'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from '@/api'
import { buildAgentContextState, createFocusReader } from '@/utils/agentContext'
import useAgentPageEntry from '@/hooks/useAgentPageEntry'
import { Loading, Empty, ErrorBanner } from '@/components/Feedback'
import { buildReturnTargetAttr, resolveReturnEntityId, useReturnScroll } from '@/utils/returnNavigation'
import { useSuitStore } from '@/store'
import { buildCollectionViewModel, buildSuitCardModel } from './viewModel'
import styles from './index.module.less'

const SuitCard = ({ model, highlighted, onDelete, onAgent }) => (
  <article className={`${styles.card} ${highlighted ? styles.cardHighlighted : ''}`}>
    <div className={styles.cardTop}>
      <div className={styles.coverMosaic}>
        <div className={styles.coverPrimary}>
          {model.coverItems[0]?.image ? (
            <img src={model.coverItems[0].image} alt={model.coverItems[0].alt} />
          ) : (
            <div className={styles.coverFallback} />
          )}
        </div>
        <div className={styles.coverSecondaryRow}>
          {model.coverItems.slice(1, 3).map((item) => (
            <div key={item.id} className={styles.coverSecondary}>
              {item.image ? <img src={item.image} alt={item.alt} /> : <div className={styles.coverFallback} />}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.cardInfo}>
        <h3 className={styles.cardTitle}>{model.title}</h3>
        <div className={styles.cardMetaRow}>
          <span className={styles.sceneBadge}>{model.sceneLabel}</span>
          <span className={styles.metaText}>{model.countLabel}</span>
          <span className={styles.metaText}>{model.timeLabel}</span>
        </div>
        {model.previewText ? <div className={styles.cardPreview}>{model.previewText}</div> : null}

        <div className={styles.cardActions}>
          <button type="button" className={styles.agentButton} onClick={() => onAgent(model.raw)}>
            交给 Agent
          </button>
          <button type="button" className={styles.deleteButton} onClick={() => onDelete(model.raw)}>
            删除
          </button>
        </div>
      </div>
    </div>

    <div className={styles.thumbStrip}>
      {model.thumbs.length ? (
        model.thumbs.map((item) => (
          <div className={styles.thumb} key={item.id}>
            {item.image ? <img src={item.image} alt={item.alt} /> : <div className={styles.thumbPlaceholder} />}
          </div>
        ))
      ) : (
        <div className={styles.cardEmpty}>单品信息缺失</div>
      )}
    </div>
  </article>
)

export default function Suits({ embedded = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { suits, status, error, fetchAllSuits, setSuits } = useSuitStore()
  const highlightedSuitId = resolveReturnEntityId(location.state, [
    createFocusReader('suit'),
    (state) => state.selectedSuit,
  ])

  const loading = status === 'loading'
  const suitList = useMemo(() => (Array.isArray(suits) ? suits : []), [suits])
  const hasData = suitList.length > 0
  const collectionModel = useMemo(() => buildCollectionViewModel(suitList), [suitList])
  const cardModels = useMemo(() => suitList.map((suit) => buildSuitCardModel(suit)), [suitList])

  const fetchSuits = useCallback(async (forceRefresh = false) => {
    try {
      await fetchAllSuits(forceRefresh)
    } catch (err) {
      console.warn('Failed to load suits', err)
    }
  }, [fetchAllSuits])

  useEffect(() => {
    void fetchSuits()
  }, [fetchSuits])

  useAgentPageEntry({
    enabled: !embedded,
    presetTask: '帮我看看我的套装库，并告诉我下一步可以怎么整理',
  })

  useReturnScroll({ prefix: 'suit', id: highlightedSuitId, watch: suitList.length })

  const handleDelete = (suit) => {
    Dialog.confirm({
      message: '确定删除该套装吗？',
      onConfirm: async () => {
        try {
          await axios.delete(`/suits/${suit.suit_id}`)
          Toast.show({ content: '删除成功', duration: 1000 })
          setSuits((prev) => prev.filter((item) => item.suit_id !== suit.suit_id))
        } catch {
          Toast.show({ content: '删除失败，请重试', duration: 1200 })
        }
      },
    })
  }

  const handleAgent = useCallback((suit) => {
    if (!suit?.suit_id) return
    navigate('/unified-agent', {
      state: buildAgentContextState({
        presetTask: `帮我处理这套已保存套装：${suit.name || suit.scene || `套装 ${suit.suit_id}`}`,
        focus: {
          type: 'suit',
          entity: suit,
        },
      }),
    })
  }, [navigate])

  const handleCreate = useCallback(() => {
    navigate('/suits/create')
  }, [navigate])

  const renderContent = () => {
    if (loading) return <Loading text="加载套装库..." />
    if (error) return <ErrorBanner message={error} onAction={fetchSuits} />
    if (!hasData) {
      return (
        <div className={styles.emptyWrap}>
          <Empty description="暂无套装，先从推荐里保存一套吧" />
          <div className={styles.emptyActions}>
            <button type="button" className={styles.emptyGhost} onClick={() => navigate('/match?tab=recommend')}>
              去场景推荐
            </button>
            <button type="button" className={styles.emptyPrimary} onClick={handleCreate}>
              新建套装
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className={styles.cardList}>
        {cardModels.map((model) => (
          <div
            key={model.id}
            data-return-target={buildReturnTargetAttr('suit', model.id)}
          >
            <SuitCard
              model={model}
              highlighted={highlightedSuitId === model.id}
              onDelete={handleDelete}
              onAgent={handleAgent}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`${styles.suits} ${embedded ? styles.suitsEmbedded : ''}`}>
      <div className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <div className={styles.heroTitle}>套装库</div>
            <div className={styles.heroMeta}>{collectionModel.heroMeta}</div>
          </div>
          <button type="button" className={styles.createButton} onClick={handleCreate}>
            新建套装
          </button>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{collectionModel.primaryStat.label}</div>
            <div className={styles.statValue}>{collectionModel.primaryStat.value}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>{collectionModel.secondaryStat.label}</div>
            <div className={styles.statValue}>{collectionModel.secondaryStat.value}</div>
          </div>
        </div>

        <div className={styles.heroHint}>{collectionModel.heroHint}</div>
      </div>

      <div className={styles.body}>{renderContent()}</div>
    </div>
  )
}
