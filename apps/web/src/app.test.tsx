import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from './stores/app.store';
import App from './app';

vi.mock('./api/client', () => ({
  assemblyLines: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({
      id: 'line-1',
      name: 'My Pipeline',
      slug: 'my-pipeline',
      status: 'ACTIVE',
      steps: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }),
    update: vi.fn(),
    listPackages: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, limit: 20 } }),
  },
  workerPools: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({
      id: 'pool-1',
      name: 'GPU Pool',
      slug: 'gpu-pool',
      status: 'ACTIVE',
      maxConcurrency: 10,
      members: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }),
    create: vi.fn(),
    update: vi.fn(),
    submitPackage: vi.fn(),
  },
  workers: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({
      id: 'w-1',
      name: 'Summarizer',
      slug: 'summarizer',
      versions: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }),
    create: vi.fn(),
    createVersion: vi.fn(),
    deprecateVersion: vi.fn(),
  },
  packages: {
    list: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, limit: 0 } }),
    get: vi.fn().mockResolvedValue({
      id: 'abc-123',
      type: 'USER_INPUT',
      status: 'PENDING',
      metadata: {},
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }),
    listFiles: vi.fn().mockResolvedValue([]),
    getDownloadUrl: vi.fn(),
  },
  jobs: {
    list: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, limit: 50 } }),
  },
}));

vi.mock('phaser', () => {
  class MockSprite {
    setInteractive() { return this; }
    setOrigin() { return this; }
    setDepth() { return this; }
    setTint() { return this; }
    on() { return this; }
    destroy() {}
  }

  return {
    default: {
      Game: vi.fn().mockImplementation(() => ({ destroy: vi.fn() })),
      AUTO: 0,
      Scale: { RESIZE: 3, CENTER_BOTH: 1 },
      Scene: class MockScene {
        constructor(_config: unknown) {}
      },
      GameObjects: {
        Sprite: MockSprite,
        Graphics: class MockGraphics {},
        Container: class MockContainer {},
        Text: class MockText {},
      },
      Math: {
        Clamp: (val: number, min: number, max: number) =>
          globalThis.Math.min(globalThis.Math.max(val, min), max),
      },
    },
    __esModule: true,
  };
});

vi.mock('./api/socket', () => ({
  socketManager: {
    onEvent: vi.fn(() => vi.fn()),
    connect: vi.fn(),
    disconnect: vi.fn(),
    getState: vi.fn(() => 'disconnected'),
    onStateChange: vi.fn(() => vi.fn()),
    subscribeAssemblyLine: vi.fn(),
    subscribeWorkerPool: vi.fn(),
    subscribeJob: vi.fn(),
    sendInteractiveResponse: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

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

  it('renders the shell layout with sidebar and header', async () => {
    renderApp();
    expect(await screen.findByTestId('desktop-sidebar')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders Dashboard page on /', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 2, name: 'System Overview' })).toBeInTheDocument();
  });

  it('renders the main content area', () => {
    renderApp();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders Assembly Line list page on /assembly-lines', async () => {
    renderApp(['/assembly-lines']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Assembly Lines' })).toBeInTheDocument();
  });

  it('renders Assembly Line create page on /assembly-lines/create', async () => {
    renderApp(['/assembly-lines/create']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Create Assembly Line' })).toBeInTheDocument();
  });

  it('renders Assembly Line detail page on /assembly-lines/:slug', async () => {
    renderApp(['/assembly-lines/my-pipeline']);
    expect(await screen.findByRole('heading', { level: 2, name: 'My Pipeline' })).toBeInTheDocument();
  });

  it('renders Worker Pool list page on /worker-pools', async () => {
    renderApp(['/worker-pools']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Worker Pools' })).toBeInTheDocument();
  });

  it('renders Worker Pool create page on /worker-pools/create', async () => {
    renderApp(['/worker-pools/create']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Create Worker Pool' })).toBeInTheDocument();
  });

  it('renders Worker Pool detail page on /worker-pools/:slug', async () => {
    renderApp(['/worker-pools/gpu-pool']);
    expect(await screen.findByRole('heading', { level: 2, name: 'GPU Pool' })).toBeInTheDocument();
  });

  it('renders Package list page on /packages', async () => {
    renderApp(['/packages']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Packages' })).toBeInTheDocument();
  });

  it('renders Package detail page on /packages/:id', async () => {
    renderApp(['/packages/abc-123']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Package' })).toBeInTheDocument();
  });

  it('renders Worker list page on /workers', async () => {
    renderApp(['/workers']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Workers' })).toBeInTheDocument();
  });

  it('renders Worker detail page on /workers/:slug', async () => {
    renderApp(['/workers/summarizer']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Summarizer' })).toBeInTheDocument();
  });

  it('renders Logs page on /logs', async () => {
    renderApp(['/logs']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Log Viewer' })).toBeInTheDocument();
  });

  it('renders Factory page on /factory', async () => {
    renderApp(['/factory']);
    expect(await screen.findByTestId('phaser-container')).toBeInTheDocument();
  });

  it('renders 404 Not Found page for unknown routes', async () => {
    renderApp(['/does-not-exist']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Page Not Found' })).toBeInTheDocument();
    expect(screen.getByText('The page you are looking for does not exist.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute('href', '/');
  });

  it('does not render /assembly-lines/create as a :slug route', async () => {
    renderApp(['/assembly-lines/create']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Create Assembly Line' })).toBeInTheDocument();
    expect(screen.queryByText('Assembly Line: create')).not.toBeInTheDocument();
  });

  it('does not render /worker-pools/create as a :slug route', async () => {
    renderApp(['/worker-pools/create']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Create Worker Pool' })).toBeInTheDocument();
    expect(screen.queryByText('Worker Pool: create')).not.toBeInTheDocument();
  });
});
