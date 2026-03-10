import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/app.store';
import { ThemeToggle } from '../theme-toggle';

function resetStore() {
  useAppStore.setState({
    viewMode: 'managerial',
    socketState: 'disconnected',
    unreadNotificationCount: 0,
    selectedWorkerId: null,
    selectedPackageId: null,
    theme: 'system',
  });
  document.documentElement.classList.remove('dark');
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  it('renders a button with aria-label "Toggle theme"', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
  });

  it('cycles from system to light on first click', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: 'Toggle theme' }));

    expect(useAppStore.getState().theme).toBe('light');
  });

  it('cycles from light to dark', async () => {
    useAppStore.setState({ theme: 'light' });
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: 'Toggle theme' }));

    expect(useAppStore.getState().theme).toBe('dark');
  });

  it('cycles from dark back to system', async () => {
    useAppStore.setState({ theme: 'dark' });
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: 'Toggle theme' }));

    expect(useAppStore.getState().theme).toBe('system');
  });

  it('full cycle: system -> light -> dark -> system', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: 'Toggle theme' });

    await user.click(btn);
    expect(useAppStore.getState().theme).toBe('light');

    await user.click(btn);
    expect(useAppStore.getState().theme).toBe('dark');

    await user.click(btn);
    expect(useAppStore.getState().theme).toBe('system');
  });
});
