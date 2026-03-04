import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Phaser from 'phaser';
import FactoryPage from '../index';

vi.mock('phaser', () => {
  class MockSprite {
    constructor() {}
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
      Scale: {
        RESIZE: 3,
        CENTER_BOTH: 1,
      },
      Scene: class MockScene {
        constructor(_config: unknown) {}
      },
      GameObjects: {
        Sprite: MockSprite,
        Graphics: class MockGraphics {
          constructor() {}
        },
        Container: class MockContainer {
          constructor() {}
        },
        Text: class MockText {
          constructor() {}
        },
      },
    },
    __esModule: true,
  };
});

vi.mock('@/api/socket', () => ({
  socketManager: {
    sendInteractiveResponse: vi.fn(),
    onEvent: vi.fn(() => vi.fn()),
    connect: vi.fn(),
  },
}));

vi.mock('@/api/client', () => ({
  assemblyLines: { list: vi.fn().mockResolvedValue([]) },
  workerPools: { list: vi.fn().mockResolvedValue([]) },
  packages: { create: vi.fn(), getUploadUrl: vi.fn(), confirmUpload: vi.fn() },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const MockGameCtor = vi.mocked(Phaser.Game);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FactoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the full-viewport container', () => {
    const { container } = renderWithProviders(<FactoryPage />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.className).toContain('w-screen');
    expect(root.className).toContain('h-screen');
    expect(root.className).toContain('relative');
  });

  it('renders the phaser container', () => {
    renderWithProviders(<FactoryPage />);
    expect(screen.getByTestId('phaser-container')).toBeInTheDocument();
  });

  it('renders an overlay div with pointer-events-none and z-10', () => {
    const { container } = renderWithProviders(<FactoryPage />);
    const root = container.firstElementChild as HTMLElement;
    const overlay = root.querySelector('.pointer-events-none');
    expect(overlay).toBeInTheDocument();
    expect(overlay!.className).toContain('absolute');
    expect(overlay!.className).toContain('inset-0');
    expect(overlay!.className).toContain('z-10');
  });

  it('mounts PhaserGame component that creates a game instance', () => {
    renderWithProviders(<FactoryPage />);
    expect(MockGameCtor).toHaveBeenCalledTimes(1);
  });

  it('overlay is a sibling of the phaser container', () => {
    const { container } = renderWithProviders(<FactoryPage />);
    const root = container.firstElementChild as HTMLElement;
    const children = Array.from(root.children);
    expect(children.length).toBe(2);
    // First child is the phaser container, second is the overlay
    expect(children[0]!.getAttribute('data-testid')).toBe('phaser-container');
    expect(children[1]!.className).toContain('pointer-events-none');
  });
});
