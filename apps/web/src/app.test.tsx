import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './stores/app.store';
import App from './app';

function resetStore() {
  useAppStore.setState({
    viewMode: 'managerial',
    socketState: 'disconnected',
    unreadNotificationCount: 0,
    selectedWorkerId: null,
    selectedPackageId: null,
  });
}

function renderApp(initialEntries = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    resetStore();
    localStorage.clear();
  });

  it('renders the shell layout with sidebar and header', () => {
    renderApp();
    expect(screen.getByTestId('desktop-sidebar')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders the Dashboard placeholder on the home route', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Dashboard');
  });

  it('renders the main content area', () => {
    renderApp();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders Assembly Lines page on /assembly-lines', () => {
    renderApp(['/assembly-lines']);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Assembly Lines');
  });

  it('renders Worker Pools page on /worker-pools', () => {
    renderApp(['/worker-pools']);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Worker Pools');
  });

  it('renders Packages page on /packages', () => {
    renderApp(['/packages']);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Packages');
  });

  it('renders Workers page on /workers', () => {
    renderApp(['/workers']);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Workers');
  });

  it('renders Logs page on /logs', () => {
    renderApp(['/logs']);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Logs');
  });

  it('renders Factory page on /factory', () => {
    renderApp(['/factory']);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Factory');
  });
});
