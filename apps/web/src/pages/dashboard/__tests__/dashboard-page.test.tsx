import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DashboardPage from '../index';
import * as client from '@/api/client';

vi.mock('@/api/client', () => ({
  assemblyLines: { list: vi.fn() },
  workerPools: { list: vi.fn() },
  packages: { list: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  },
}));

vi.mock('@/api/socket', () => ({
  socketManager: {
    onEvent: vi.fn(() => vi.fn()),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.assemblyLines.list).mockResolvedValue([
      { id: '1' },
      { id: '2' },
    ] as never);
    vi.mocked(client.workerPools.list).mockResolvedValue([
      { id: '1', maxConcurrency: 10, activeJobCount: 3 },
    ] as never);
    vi.mocked(client.packages.list).mockResolvedValue({
      data: [],
      total: 7,
    } as never);
  });

  it('renders the System Overview heading', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 2, name: 'System Overview' }),
    ).toBeInTheDocument();
  });

  it('renders quick action buttons', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /Submit Package/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Create Assembly Line/i }),
    ).toBeInTheDocument();
  });

  it('navigates to packages on Submit Package click', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: /Submit Package/i }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/packages');
  });

  it('navigates to create assembly line on Create Assembly Line click', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: /Create Assembly Line/i }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/assembly-lines/create');
  });

  it('renders stats cards after data loads', async () => {
    renderPage();

    await screen.findByText('Active Assembly Lines');
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Active Worker Pools')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('In-Transit Packages')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Running Containers')).toBeInTheDocument();
    expect(screen.getByText('3/10')).toBeInTheDocument();
  });

  it('shows loading skeletons initially', () => {
    // Override to never resolve
    vi.mocked(client.assemblyLines.list).mockReturnValue(
      new Promise(() => {}),
    );
    vi.mocked(client.workerPools.list).mockReturnValue(
      new Promise(() => {}),
    );
    vi.mocked(client.packages.list).mockReturnValue(new Promise(() => {}));

    const { container } = renderPage();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows error state when API fails', async () => {
    vi.mocked(client.assemblyLines.list).mockRejectedValue(
      new Error('Service unavailable'),
    );

    renderPage();

    await screen.findByRole('alert');
    expect(
      screen.getByText(/Failed to load dashboard stats: Service unavailable/),
    ).toBeInTheDocument();
  });

  it('renders the activity feed section', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Activity Feed' }),
    ).toBeInTheDocument();
  });

  it('renders activity feed empty state', () => {
    renderPage();
    expect(
      screen.getByText(
        'No recent activity. Events will appear here in real-time.',
      ),
    ).toBeInTheDocument();
  });
});
