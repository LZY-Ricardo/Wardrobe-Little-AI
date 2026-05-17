const MIME_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const normalizeMimeType = (mimeType) => {
  const normalized = String(mimeType || '').trim().toLowerCase()
  if (normalized.startsWith('image/')) return normalized
  return 'image/jpeg'
}

export const createPreviewUploadFile = (blob, baseName) => {
  const mimeType = normalizeMimeType(blob?.type)
  const extension = MIME_EXTENSION_MAP[mimeType] || 'jpg'
  return new File([blob], `${baseName}.${extension}`, { type: mimeType })
}
