import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/app.store';
import ShellLayout from './shell';

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
  });
}

function renderShell(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route element={<ShellLayout />}>
          <Route index element={<div data-testid="page-home">Home Page</div>} />
          <Route path="assembly-lines" element={<div data-testid="page-assembly">Assembly Lines Page</div>} />
          <Route path="factory" element={<div data-testid="page-factory">Factory Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ShellLayout', () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  it('renders the desktop sidebar', () => {
    renderShell();
    expect(screen.getByTestId('desktop-sidebar')).toBeInTheDocument();
  });

  it('renders the header', () => {
    renderShell();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders the main content area', () => {
    renderShell();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders outlet content for home route', () => {
    renderShell(['/']);
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });

  it('renders outlet content for assembly-lines route', () => {
    renderShell(['/assembly-lines']);
    expect(screen.getByTestId('page-assembly')).toBeInTheDocument();
  });

  it('renders outlet content for factory route', () => {
    renderShell(['/factory']);
    expect(screen.getByTestId('page-factory')).toBeInTheDocument();
  });

  it('renders sidebar, header, and content together', () => {
    renderShell();
    expect(screen.getByTestId('desktop-sidebar')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
  });
});
