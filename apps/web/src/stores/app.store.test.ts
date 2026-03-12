import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useAppStore,
  useViewMode,
  useSocketState,
  useUnreadNotificationCount,
  useSelectedWorkerId,
  useSelectedPackageId,
  useTheme,
  applyThemeClass,
} from './app.store';
import type { AppStore } from './app.store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset store to initial state between tests */
function resetStore(): void {
  useAppStore.setState({
    viewMode: 'managerial',
    socketState: 'disconnected',
    unreadNotificationCount: 0,
    selectedWorkerId: null,
    selectedPackageId: null,
    theme: 'system',
  });
}

/** Shorthand to get current state */
function state(): AppStore {
  return useAppStore.getState();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAppStore', () => {
  beforeEach(() => {
    resetStore();
    // Clear localStorage to avoid persist middleware interference
    localStorage.clear();
    // Reset dark class
    document.documentElement.classList.remove('dark');
  });

  // -------------------------------------------------------------------------
  // Default state
  // -------------------------------------------------------------------------

  describe('default state', () => {
    it('has viewMode defaulting to managerial', () => {
      expect(state().viewMode).toBe('managerial');
    });

    it('has socketState defaulting to disconnected', () => {
      expect(state().socketState).toBe('disconnected');
    });

    it('has unreadNotificationCount defaulting to 0', () => {
      expect(state().unreadNotificationCount).toBe(0);
    });

    it('has selectedWorkerId defaulting to null', () => {
      expect(state().selectedWorkerId).toBeNull();
    });

    it('has selectedPackageId defaulting to null', () => {
      expect(state().selectedPackageId).toBeNull();
    });

    it('has theme defaulting to system', () => {
      expect(state().theme).toBe('system');
    });
  });

  // -------------------------------------------------------------------------
  // setViewMode
  // -------------------------------------------------------------------------

  describe('setViewMode', () => {
    it('updates viewMode to factory', () => {
      state().setViewMode('factory');
      expect(state().viewMode).toBe('factory');
    });

    it('updates viewMode back to managerial', () => {
      state().setViewMode('factory');
      state().setViewMode('managerial');
      expect(state().viewMode).toBe('managerial');
    });
  });

  // -------------------------------------------------------------------------
  // setSocketState
  // -------------------------------------------------------------------------

  describe('setSocketState', () => {
    it('updates socketState to connected', () => {
      state().setSocketState('connected');
      expect(state().socketState).toBe('connected');
    });

    it('updates socketState to reconnecting', () => {
      state().setSocketState('reconnecting');
      expect(state().socketState).toBe('reconnecting');
    });

    it('updates socketState to disconnected', () => {
      state().setSocketState('connected');
      state().setSocketState('disconnected');
      expect(state().socketState).toBe('disconnected');
    });
  });

  // -------------------------------------------------------------------------
  // incrementNotifications / resetNotifications
  // -------------------------------------------------------------------------

  describe('notification actions', () => {
    it('incrementNotifications increases count by 1', () => {
      state().incrementNotifications();
      expect(state().unreadNotificationCount).toBe(1);
    });

    it('incrementNotifications can be called multiple times', () => {
      state().incrementNotifications();
      state().incrementNotifications();
      state().incrementNotifications();
      expect(state().unreadNotificationCount).toBe(3);
    });

    it('resetNotifications sets count to 0', () => {
      state().incrementNotifications();
      state().incrementNotifications();
      state().resetNotifications();
      expect(state().unreadNotificationCount).toBe(0);
    });

    it('resetNotifications on zero count remains zero', () => {
      state().resetNotifications();
      expect(state().unreadNotificationCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // selectWorker
  // -------------------------------------------------------------------------

  describe('selectWorker', () => {
    it('sets selectedWorkerId to a given id', () => {
      state().selectWorker('worker-123');
      expect(state().selectedWorkerId).toBe('worker-123');
    });

    it('sets selectedWorkerId to null to deselect', () => {
      state().selectWorker('worker-123');
      state().selectWorker(null);
      expect(state().selectedWorkerId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // selectPackage
  // -------------------------------------------------------------------------

  describe('selectPackage', () => {
    it('sets selectedPackageId to a given id', () => {
      state().selectPackage('pkg-456');
      expect(state().selectedPackageId).toBe('pkg-456');
    });

    it('sets selectedPackageId to null to deselect', () => {
      state().selectPackage('pkg-456');
      state().selectPackage(null);
      expect(state().selectedPackageId).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // setTheme
  // -------------------------------------------------------------------------

  describe('setTheme', () => {
    it('updates theme to dark', () => {
      state().setTheme('dark');
      expect(state().theme).toBe('dark');
    });

    it('updates theme to light', () => {
      state().setTheme('light');
      expect(state().theme).toBe('light');
    });

    it('updates theme back to system', () => {
      state().setTheme('dark');
      state().setTheme('system');
      expect(state().theme).toBe('system');
    });

    it('adds dark class when set to dark', () => {
      state().setTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('removes dark class when set to light', () => {
      document.documentElement.classList.add('dark');
      state().setTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // applyThemeClass
  // -------------------------------------------------------------------------

  describe('applyThemeClass', () => {
    it('adds dark class for dark theme', () => {
      applyThemeClass('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('removes dark class for light theme', () => {
      document.documentElement.classList.add('dark');
      applyThemeClass('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('respects prefers-color-scheme for system theme', () => {
      // jsdom defaults to no dark preference, so system should remove dark
      applyThemeClass('system');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  describe('persistence', () => {
    it('persists viewMode and theme to localStorage under smithy-app-storage key', () => {
      state().setViewMode('factory');
      state().setTheme('dark');

      const stored = localStorage.getItem('smithy-app-storage');
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.state.viewMode).toBe('factory');
      expect(parsed.state.theme).toBe('dark');
    });

    it('does NOT persist socketState to localStorage', () => {
      state().setSocketState('connected');
      const stored = localStorage.getItem('smithy-app-storage');
      if (stored) {
        const parsed = JSON.parse(stored);
        expect(parsed.state.socketState).toBeUndefined();
      }
    });

    it('does NOT persist unreadNotificationCount to localStorage', () => {
      state().incrementNotifications();
      const stored = localStorage.getItem('smithy-app-storage');
      if (stored) {
        const parsed = JSON.parse(stored);
        expect(parsed.state.unreadNotificationCount).toBeUndefined();
      }
    });

    it('does NOT persist selectedWorkerId to localStorage', () => {
      state().selectWorker('worker-1');
      const stored = localStorage.getItem('smithy-app-storage');
      if (stored) {
        const parsed = JSON.parse(stored);
        expect(parsed.state.selectedWorkerId).toBeUndefined();
      }
    });

    it('does NOT persist selectedPackageId to localStorage', () => {
      state().selectPackage('pkg-1');
      const stored = localStorage.getItem('smithy-app-storage');
      if (stored) {
        const parsed = JSON.parse(stored);
        expect(parsed.state.selectedPackageId).toBeUndefined();
      }
    });

    it('restores viewMode from localStorage on rehydration', () => {
      localStorage.setItem(
        'smithy-app-storage',
        JSON.stringify({ state: { viewMode: 'factory', theme: 'system' }, version: 0 }),
      );

      useAppStore.persist.rehydrate();

      expect(state().viewMode).toBe('factory');
    });

    it('restores theme from localStorage on rehydration', () => {
      localStorage.setItem(
        'smithy-app-storage',
        JSON.stringify({ state: { viewMode: 'managerial', theme: 'dark' }, version: 0 }),
      );

      useAppStore.persist.rehydrate();

      expect(state().theme).toBe('dark');
    });

    it('ephemeral state is not affected by rehydration', () => {
      // Set some ephemeral state
      state().setSocketState('connected');
      state().incrementNotifications();
      state().selectWorker('worker-99');

      // Seed localStorage and rehydrate
      localStorage.setItem(
        'smithy-app-storage',
        JSON.stringify({ state: { viewMode: 'factory', theme: 'dark' }, version: 0 }),
      );
      useAppStore.persist.rehydrate();

      // viewMode and theme should change, but ephemeral state stays
      expect(state().viewMode).toBe('factory');
      expect(state().theme).toBe('dark');
      expect(state().socketState).toBe('connected');
      expect(state().unreadNotificationCount).toBe(1);
      expect(state().selectedWorkerId).toBe('worker-99');
    });
  });

  // -------------------------------------------------------------------------
  // Cross-slice isolation
  // -------------------------------------------------------------------------

  describe('cross-slice isolation', () => {
    it('setting viewMode does not affect other slices', () => {
      state().setSocketState('connected');
      state().incrementNotifications();
      state().selectWorker('w1');
      state().selectPackage('p1');

      state().setViewMode('factory');

      expect(state().socketState).toBe('connected');
      expect(state().unreadNotificationCount).toBe(1);
      expect(state().selectedWorkerId).toBe('w1');
      expect(state().selectedPackageId).toBe('p1');
    });

    it('setting socketState does not affect other slices', () => {
      state().setViewMode('factory');
      state().incrementNotifications();

      state().setSocketState('reconnecting');

      expect(state().viewMode).toBe('factory');
      expect(state().unreadNotificationCount).toBe(1);
    });

    it('setting theme does not affect other slices', () => {
      state().setViewMode('factory');
      state().setSocketState('connected');

      state().setTheme('dark');

      expect(state().viewMode).toBe('factory');
      expect(state().socketState).toBe('connected');
    });
  });

  // -------------------------------------------------------------------------
  // Selector hooks (exported convenience hooks)
  // -------------------------------------------------------------------------

  describe('convenience selector hooks', () => {
    it('useViewMode returns current viewMode', () => {
      const { result } = renderHook(() => useViewMode());
      expect(result.current).toBe('managerial');

      act(() => state().setViewMode('factory'));
      expect(result.current).toBe('factory');
    });

    it('useSocketState returns current socketState', () => {
      const { result } = renderHook(() => useSocketState());
      expect(result.current).toBe('disconnected');

      act(() => state().setSocketState('connected'));
      expect(result.current).toBe('connected');
    });

    it('useUnreadNotificationCount returns current count', () => {
      const { result } = renderHook(() => useUnreadNotificationCount());
      expect(result.current).toBe(0);

      act(() => state().incrementNotifications());
      expect(result.current).toBe(1);
    });

    it('useSelectedWorkerId returns current selectedWorkerId', () => {
      const { result } = renderHook(() => useSelectedWorkerId());
      expect(result.current).toBeNull();

      act(() => state().selectWorker('w-1'));
      expect(result.current).toBe('w-1');
    });

    it('useSelectedPackageId returns current selectedPackageId', () => {
      const { result } = renderHook(() => useSelectedPackageId());
      expect(result.current).toBeNull();

      act(() => state().selectPackage('p-1'));
      expect(result.current).toBe('p-1');
    });

    it('useTheme returns current theme', () => {
      const { result } = renderHook(() => useTheme());
      expect(result.current).toBe('system');

      act(() => state().setTheme('dark'));
      expect(result.current).toBe('dark');
    });
  });
});
