import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import WorkerListPage from '../worker-list';
import LogViewerPage from '../log-viewer';
import FactoryPage from '../factory';

vi.mock('@/api/client', () => ({
  workers: {
    list: vi.fn().mockResolvedValue([]),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  },
}));

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// PackageListPage has a dedicated test suite in package-list.test.tsx.
// WorkerPoolListPage, WorkerPoolCreatePage, WorkerPoolDetailPage, and
// AssemblyLine pages have dedicated test suites.
// WorkerListPage, WorkerDetailPage, and WorkerCreatePage have dedicated test suites.

describe('WorkerListPage', () => {
  it('renders heading', () => {
    renderWithQuery(<WorkerListPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Workers' })).toBeInTheDocument();
  });
});

describe('LogViewerPage', () => {
  it('renders heading and coming soon text', () => {
    renderInRouter(<LogViewerPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Logs' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Log Viewer')).toBeInTheDocument();
  });
});

describe('FactoryPage', () => {
  it('renders heading and coming soon text', () => {
    renderInRouter(<FactoryPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Factory' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Factory View')).toBeInTheDocument();
  });
});
