import { render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { Button } from '../button';

describe('dark mode infrastructure', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('dark class can be toggled on html element', () => {
    document.documentElement.classList.add('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    document.documentElement.classList.remove('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('renders a styled component in light mode', () => {
    render(<Button>Light mode button</Button>);
    const button = screen.getByRole('button', { name: 'Light mode button' });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('bg-primary');
  });

  it('renders a styled component with dark class set', () => {
    document.documentElement.classList.add('dark');
    render(<Button>Dark mode button</Button>);
    const button = screen.getByRole('button', { name: 'Dark mode button' });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('bg-primary');
  });
});
