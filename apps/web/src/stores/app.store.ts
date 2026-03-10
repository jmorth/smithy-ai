import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViewMode = 'managerial' | 'factory';
export type SocketState = 'connected' | 'disconnected' | 'reconnecting';
export type Theme = 'light' | 'dark' | 'system';

export interface AppState {
  viewMode: ViewMode;
  socketState: SocketState;
  unreadNotificationCount: number;
  selectedWorkerId: string | null;
  selectedPackageId: string | null;
  theme: Theme;
}

export interface AppActions {
  setViewMode: (mode: ViewMode) => void;
  setSocketState: (state: SocketState) => void;
  incrementNotifications: () => void;
  resetNotifications: () => void;
  selectWorker: (id: string | null) => void;
  selectPackage: (id: string | null) => void;
  setTheme: (theme: Theme) => void;
}

export type AppStore = AppState & AppActions;

// ---------------------------------------------------------------------------
// Theme helper
// ---------------------------------------------------------------------------

export function applyThemeClass(theme: Theme): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      // State
      viewMode: 'managerial',
      socketState: 'disconnected',
      unreadNotificationCount: 0,
      selectedWorkerId: null,
      selectedPackageId: null,
      theme: 'system',

      // Actions
      setViewMode: (mode) => set({ viewMode: mode }),
      setSocketState: (state) => set({ socketState: state }),
      incrementNotifications: () =>
        set((s) => ({ unreadNotificationCount: s.unreadNotificationCount + 1 })),
      resetNotifications: () => set({ unreadNotificationCount: 0 }),
      selectWorker: (id) => set({ selectedWorkerId: id }),
      selectPackage: (id) => set({ selectedPackageId: id }),
      setTheme: (theme) => {
        applyThemeClass(theme);
        set({ theme });
      },
    }),
    {
      name: 'smithy-app-storage',
      partialize: (state) => ({ viewMode: state.viewMode, theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyThemeClass(state.theme);
        }
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Convenience selector hooks
// ---------------------------------------------------------------------------

export const useViewMode = () => useAppStore((s) => s.viewMode);
export const useSocketState = () => useAppStore((s) => s.socketState);
export const useUnreadNotificationCount = () =>
  useAppStore((s) => s.unreadNotificationCount);
export const useSelectedWorkerId = () => useAppStore((s) => s.selectedWorkerId);
export const useSelectedPackageId = () =>
  useAppStore((s) => s.selectedPackageId);
export const useTheme = () => useAppStore((s) => s.theme);
