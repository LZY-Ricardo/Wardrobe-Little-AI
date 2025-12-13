import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

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
    (set) => ({
      accessToken: '',
      refreshToken: '',
      userInfo: null,
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
        }),
      setUserInfo: (userInfo) => set({ userInfo: normalizeUserInfo(userInfo) }),
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        userInfo: state.userInfo,
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
    (set) => ({
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
        }),
    }),
    {
      name: 'closet-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        filters: state.filters,
        page: state.page,
        hasMore: state.hasMore,
      }),
    }
  )
)
