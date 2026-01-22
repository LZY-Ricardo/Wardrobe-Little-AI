import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import axios from 'axios'

const normalizeUserInfo = (userInfo) => {
  if (!userInfo || typeof userInfo !== 'object') return null
  return {
    id: userInfo.id,
    username: userInfo.username,
    createTime: userInfo.createTime ?? userInfo.create_time,
    sex: userInfo.sex,
    avatar: userInfo.avatar,
    hasCharacterModel: Boolean(userInfo.hasCharacterModel || userInfo.characterModel),
  }
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      accessToken: '',
      refreshToken: '',
      userInfo: null,
      // 新增字段
      userLastFetchedAt: 0,
      userFetchStatus: 'idle',
      userFetchError: '',
      setTokens: ({ accessToken, refreshToken }) =>
        set((state) => ({
          accessToken: accessToken ?? state.accessToken,
          refreshToken: refreshToken ?? state.refreshToken,
        })),
      clearTokens: () =>
        set({
          accessToken: '',
          refreshToken: '',
          userInfo: null,
          userLastFetchedAt: 0,
        }),
      setUserInfo: (userInfo) => set({
        userInfo: normalizeUserInfo(userInfo),
        userLastFetchedAt: Date.now(),
      }),
      // 新增方法
      fetchUserInfo: async (forceRefresh = false) => {
        const state = get()
        const CACHE_TTL = 3 * 60 * 1000 // 3分钟

        // 如果缓存有效且不强制刷新
        if (!forceRefresh &&
            state.userLastFetchedAt > 0 &&
            Date.now() - state.userLastFetchedAt < CACHE_TTL &&
            state.userInfo) {
          return state.userInfo
        }

        set({ userFetchStatus: 'loading', userFetchError: '' })
        try {
          const res = await axios.get('/user/getUserInfo')
          const userInfo = res?.data || null
          const normalized = normalizeUserInfo(userInfo)

          set({
            userInfo: normalized,
            userLastFetchedAt: Date.now(),
            userFetchStatus: 'success',
          })

          // 同步到 localStorage (保持兼容性)
          try {
            localStorage.setItem('userInfo', JSON.stringify(normalized))
          } catch (e) {
            console.warn('persist userInfo failed:', e)
          }

          return normalized
        } catch (error) {
          set({
            userFetchStatus: 'error',
            userFetchError: error.message || '获取用户信息失败'
          })
          throw error
        }
      },
      invalidateUserCache: () => set({ userLastFetchedAt: 0 }),
      getCachedUserInfo: () => get().userInfo,
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        userInfo: state.userInfo,
        userLastFetchedAt: state.userLastFetchedAt,
      }),
    }
  )
)

export const useUiStore = create(
  persist(
    (set) => ({
      theme: 'light',
      globalLoading: false,
      globalLoadingText: '',
      aiEntranceHidden: false,
      setTheme: (theme) => set({ theme }),
      setGlobalLoading: (loading, text = '') =>
        set({ globalLoading: loading, globalLoadingText: text }),
      setAiEntranceHidden: (hidden) => set({ aiEntranceHidden: Boolean(hidden) }),
    }),
    {
      name: 'ui-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
      }),
    }
  )
)

export const useClosetStore = create(
  persist(
    (set, get) => ({
      items: [],
      filters: {
        type: '全部',
        color: '全部',
        season: '全部',
        style: '全部',
        search: '',
      },
      page: 1,
      pageSize: 12,
      hasMore: true,
      status: 'idle',
      error: '',
      // 新增字段
      allClothes: [],
      lastFetchedAt: 0,
      setItems: (items) => set({ items }),
      appendItems: (items) =>
        set((state) => ({
          items: [...state.items, ...items],
        })),
      setFilters: (filters) =>
        set((state) => ({
          filters: { ...state.filters, ...filters },
          page: 1,
        })),
      setStatus: (status) => set({ status }),
      setError: (error) => set({ error }),
      setHasMore: (hasMore) => set({ hasMore }),
      setPage: (page) => set({ page }),
      reset: () =>
        set({
          items: [],
          allClothes: [],
          filters: {
            type: '全部',
            color: '全部',
            season: '全部',
            style: '全部',
            search: '',
          },
          page: 1,
          hasMore: true,
          status: 'idle',
          error: '',
          lastFetchedAt: 0,
        }),
      // 新增方法
      fetchAllClothes: async (forceRefresh = false) => {
        const state = get()
        const CACHE_TTL = 5 * 60 * 1000 // 5分钟

        // 如果缓存有效且不强制刷新，直接返回
        if (!forceRefresh &&
            state.lastFetchedAt > 0 &&
            Date.now() - state.lastFetchedAt < CACHE_TTL &&
            state.allClothes.length > 0) {
          return state.allClothes
        }

        set({ status: 'loading', error: '' })
        try {
          const res = await axios.get('/clothes/all')
          const data = res?.data || []
          set({
            allClothes: data,
            items: data,
            lastFetchedAt: Date.now(),
            status: 'success',
            hasMore: data.length > 12,
          })
          return data
        } catch (error) {
          set({ status: 'error', error: error.message || '获取衣物列表失败' })
          throw error
        }
      },
      invalidateCache: () => set({ lastFetchedAt: 0 }),
      getCachedClothes: () => get().allClothes,
    }),
    {
      name: 'closet-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        allClothes: state.allClothes,
        filters: state.filters,
        page: state.page,
        hasMore: state.hasMore,
        lastFetchedAt: state.lastFetchedAt,
      }),
    }
  )
)

export const useMatchStore = create((set) => ({
  topItems: [],
  bottomItems: [],
  fetchedAt: 0,
  ownerId: null,
  setClothes: (topItems = [], bottomItems = [], ownerId = null) =>
    set({
      topItems,
      bottomItems,
      fetchedAt: Date.now(),
      ownerId,
    }),
  markStale: () => set({ fetchedAt: 0 }),
  clear: () => set({ topItems: [], bottomItems: [], fetchedAt: 0, ownerId: null }),
}))
