export async function requestFreshWeather({
  setGeoStatus,
  writeSessionJson,
  isGeoSupported,
  isSecureGeoContext,
  getCurrentPosition,
  fetchWeather,
  geoStatus,
  weatherGeoCacheKey,
  now = () => Date.now(),
  log = () => {},
}) {
  writeSessionJson(weatherGeoCacheKey, null)
  setGeoStatus(geoStatus.REQUESTING)

  if (!isGeoSupported() || !isSecureGeoContext()) {
    setGeoStatus(geoStatus.UNAVAILABLE)
    return
  }

  await new Promise((resolve) => {
    const onSuccess = async (position) => {
      const timestamp = now()
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }

      log('[weather] 重试定位成功', coords)
      writeSessionJson(weatherGeoCacheKey, {
        askedAt: timestamp,
        coords,
        coordsAt: timestamp,
        lastErrorCode: null,
        lastErrorAt: null,
      })
      setGeoStatus(geoStatus.IDLE)
      await fetchWeather(coords)
      resolve()
    }

    const onError = (geoError) => {
      log('[weather] 重试定位失败', { code: geoError?.code, message: geoError?.message })
      setGeoStatus(geoError?.code === 1 ? geoStatus.DENIED : geoStatus.ERROR)
      resolve()
    }

    getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 0,
    })
  })
}
