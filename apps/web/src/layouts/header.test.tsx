import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/app.store';
import { Header } from './header';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useAppStore.setState({
    viewMode: 'managerial',
    socketState: 'disconnected',
    unreadNotificationCount: 0,
    selectedWorkerId: null,
    selectedPackageId: null,
    theme: 'system',
  });
}

function renderHeader(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Header />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Header', () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  describe('rendering', () => {
    it('renders the header element', () => {
      renderHeader();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('renders the Smithy title for mobile', () => {
      renderHeader();
      expect(screen.getByRole('heading', { level: 1, name: 'Smithy' })).toBeInTheDocument();
    });

    it('renders the notifications button', () => {
      renderHeader();
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    });

    it('renders the mobile sidebar trigger', () => {
      renderHeader();
      expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
    });

    it('renders the theme toggle button', () => {
      renderHeader();
      expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
    });
  });

  describe('socket connection indicator', () => {
    it('shows disconnected state by default', () => {
      renderHeader();
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
      const dot = screen.getByTestId('socket-indicator');
      expect(dot.className).toContain('bg-red-500');
    });

    it('shows connected state', () => {
      useAppStore.setState({ socketState: 'connected' });
      renderHeader();
      expect(screen.getByText('Connected')).toBeInTheDocument();
      const dot = screen.getByTestId('socket-indicator');
      expect(dot.className).toContain('bg-green-500');
    });

    it('shows reconnecting state', () => {
      useAppStore.setState({ socketState: 'reconnecting' });
      renderHeader();
      expect(screen.getByText('Reconnecting')).toBeInTheDocument();
      const dot = screen.getByTestId('socket-indicator');
      expect(dot.className).toContain('bg-yellow-500');
    });

    it('has accessible label for socket status', () => {
      renderHeader();
      expect(screen.getByLabelText('Socket status: Disconnected')).toBeInTheDocument();
    });
  });

  describe('notification bell', () => {
    it('does not show badge when count is 0', () => {
      renderHeader();
      expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
    });

    it('shows badge with count when > 0', () => {
      useAppStore.setState({ unreadNotificationCount: 5 });
      renderHeader();
      const badge = screen.getByTestId('notification-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('5');
    });

    it('shows correct count for single notification', () => {
      useAppStore.setState({ unreadNotificationCount: 1 });
      renderHeader();
      expect(screen.getByTestId('notification-badge')).toHaveTextContent('1');
    });

    it('shows large notification count', () => {
      useAppStore.setState({ unreadNotificationCount: 99 });
      renderHeader();
      expect(screen.getByTestId('notification-badge')).toHaveTextContent('99');
    });
  });

  describe('view mode toggle', () => {
    it('shows Factory button when in managerial mode', () => {
      renderHeader();
      expect(
        screen.getByRole('button', { name: 'Switch to Factory view' }),
      ).toHaveTextContent('Factory');
    });

    it('shows Dashboard button when in factory mode', () => {
      useAppStore.setState({ viewMode: 'factory' });
      renderHeader();
      expect(
        screen.getByRole('button', { name: 'Switch to Dashboard view' }),
      ).toHaveTextContent('Dashboard');
    });

    it('toggles from managerial to factory on click', async () => {
      const user = userEvent.setup();
      renderHeader();

      await user.click(screen.getByRole('button', { name: 'Switch to Factory view' }));

      expect(useAppStore.getState().viewMode).toBe('factory');
    });

    it('toggles from factory to managerial on click', async () => {
      useAppStore.setState({ viewMode: 'factory' });
      const user = userEvent.setup();
      renderHeader();

      await user.click(screen.getByRole('button', { name: 'Switch to Dashboard view' }));

      expect(useAppStore.getState().viewMode).toBe('managerial');
    });

    it('shows Dashboard text after toggling back from factory', async () => {
      const user = userEvent.setup();
      renderHeader();

      await user.click(screen.getByRole('button', { name: 'Switch to Factory view' }));

      expect(
        screen.getByRole('button', { name: 'Switch to Dashboard view' }),
      ).toHaveTextContent('Dashboard');
    });
  });
});
