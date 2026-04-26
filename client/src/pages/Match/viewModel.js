const normalizeCloth = (cloth, fallbackLabel) => ({
  name: cloth?.name || fallbackLabel,
  image: cloth?.image || '',
  selected: Boolean(cloth),
})

export const buildPreviewStageModel = ({ topClothes, bottomClothes, showPreview = false } = {}) => {
  const top = normalizeCloth(topClothes, '上衣')
  const bottom = normalizeCloth(bottomClothes, '下衣')

  const hint = showPreview
    ? '预览图已生成，可继续调整衣物重新预览'
    : !topClothes && !bottomClothes
      ? '点击上方衣物，即刻预览搭配效果'
      : topClothes && !bottomClothes
        ? '已选上衣，再点选一件下衣，即刻预览搭配效果'
        : !topClothes && bottomClothes
          ? '已选下衣，再点选一件上衣，即刻预览搭配效果'
          : '搭配已就绪，可直接生成 AI 预览图'

  return {
    hint,
    hasInstantLook: Boolean(top.image && bottom.image),
    slotChips: [top.name, bottom.name].filter(Boolean),
    slots: [
      { key: 'top', label: '上衣', ...top },
      { key: 'bottom', label: '下衣', ...bottom },
    ],
  }
}
