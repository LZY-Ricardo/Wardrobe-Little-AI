export const extractCreatedSession = (payload = null) => {
  if (!payload || typeof payload !== 'object') return null
  if (payload.session?.id) return payload.session
  if (payload.data?.session?.id) return payload.data.session
  return null
}
