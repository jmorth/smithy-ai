import { render, screen, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Phaser from 'phaser';
import PhaserGame, {
  type PhaserGameHandle,
  type PhaserGameProps,
} from '../game';

const mockDestroy = vi.fn();

let capturedConfig: Record<string, unknown> | null = null;

vi.mock('phaser', () => ({
  default: {
    Game: vi.fn().mockImplementation((config: Record<string, unknown>) => {
      capturedConfig = config;
      return { destroy: mockDestroy, config };
    }),
    AUTO: 0,
    Scale: {
      RESIZE: 3,
      CENTER_BOTH: 1,
    },
  },
  __esModule: true,
}));

const MockGameCtor = vi.mocked(Phaser.Game);

describe('PhaserGame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedConfig = null;
  });

  it('creates a Phaser.Game instance on mount', () => {
    render(<PhaserGame />);
    expect(MockGameCtor).toHaveBeenCalledTimes(1);
  });

  it('passes the container div as the parent config', () => {
    render(<PhaserGame />);
    const container = screen.getByTestId('phaser-container');
    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig!.parent).toBe(container);
  });

  it('destroys the game instance on unmount', () => {
    render(<PhaserGame />);
    cleanup();
    expect(mockDestroy).toHaveBeenCalledWith(true);
  });

  it('does not accumulate Phaser instances on repeated mount/unmount', () => {
    const { unmount: unmount1 } = render(<PhaserGame />);
    expect(MockGameCtor).toHaveBeenCalledTimes(1);
    unmount1();
    expect(mockDestroy).toHaveBeenCalledTimes(1);

    const { unmount: unmount2 } = render(<PhaserGame />);
    expect(MockGameCtor).toHaveBeenCalledTimes(2);
    unmount2();
    expect(mockDestroy).toHaveBeenCalledTimes(2);

    const { unmount: unmount3 } = render(<PhaserGame />);
    expect(MockGameCtor).toHaveBeenCalledTimes(3);
    unmount3();
    expect(mockDestroy).toHaveBeenCalledTimes(3);
  });

  it('renders a container div with 100% width and height', () => {
    render(<PhaserGame />);
    const container = screen.getByTestId('phaser-container');
    expect(container.style.width).toBe('100%');
    expect(container.style.height).toBe('100%');
  });

  it('merges custom config with defaults', () => {
    const customConfig: PhaserGameProps['config'] = {
      backgroundColor: '#ff0000',
      physics: { default: 'arcade' },
    };
    render(<PhaserGame config={customConfig} />);
    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig!.backgroundColor).toBe('#ff0000');
    expect(capturedConfig!.physics).toEqual({ default: 'arcade' });
    expect(capturedConfig!.parent).toBeInstanceOf(HTMLDivElement);
  });

  it('calls onGameReady callback with the game instance', () => {
    const onGameReady = vi.fn();
    render(<PhaserGame onGameReady={onGameReady} />);
    expect(onGameReady).toHaveBeenCalledTimes(1);
    expect(onGameReady).toHaveBeenCalledWith(
      expect.objectContaining({ destroy: mockDestroy }),
    );
  });

  it('exposes game instance via ref', () => {
    const ref = createRef<PhaserGameHandle>();
    render(<PhaserGame ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.game).not.toBeNull();
    expect(ref.current!.game).toHaveProperty('destroy');
  });

  it('cleans up game on unmount (destroy called)', () => {
    const ref = createRef<PhaserGameHandle>();
    const { unmount } = render(<PhaserGame ref={ref} />);
    expect(ref.current!.game).not.toBeNull();
    unmount();
    // After unmount, React clears ref.current, but destroy was called
    expect(mockDestroy).toHaveBeenCalledWith(true);
  });

  it('uses default config when no config prop is provided', () => {
    render(<PhaserGame />);
    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig!.type).toBe(0); // Phaser.AUTO
    expect(capturedConfig!.width).toBe('100%');
    expect(capturedConfig!.height).toBe('100%');
    expect(capturedConfig!.backgroundColor).toBe('#1a1a2e');
  });
});
