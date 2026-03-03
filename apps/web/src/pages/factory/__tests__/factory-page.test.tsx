import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Phaser from 'phaser';
import FactoryPage from '../index';

vi.mock('phaser', () => ({
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
  },
  __esModule: true,
}));

const MockGameCtor = vi.mocked(Phaser.Game);

describe('FactoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the full-viewport container', () => {
    const { container } = render(<FactoryPage />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.className).toContain('w-screen');
    expect(root.className).toContain('h-screen');
    expect(root.className).toContain('relative');
  });

  it('renders the phaser container', () => {
    render(<FactoryPage />);
    expect(screen.getByTestId('phaser-container')).toBeInTheDocument();
  });

  it('renders an overlay div with pointer-events-none', () => {
    const { container } = render(<FactoryPage />);
    const root = container.firstElementChild as HTMLElement;
    const overlay = root.querySelector('.pointer-events-none');
    expect(overlay).toBeInTheDocument();
    expect(overlay!.className).toContain('absolute');
    expect(overlay!.className).toContain('inset-0');
  });

  it('mounts PhaserGame component that creates a game instance', () => {
    render(<FactoryPage />);
    expect(MockGameCtor).toHaveBeenCalledTimes(1);
  });

  it('overlay is a sibling of the phaser container', () => {
    const { container } = render(<FactoryPage />);
    const root = container.firstElementChild as HTMLElement;
    const children = Array.from(root.children);
    expect(children.length).toBe(2);
    // First child is the phaser container, second is the overlay
    expect(children[0]!.getAttribute('data-testid')).toBe('phaser-container');
    expect(children[1]!.className).toContain('pointer-events-none');
  });
});
