import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Separator } from '../separator';

describe('Separator', () => {
  it('renders a horizontal separator by default', () => {
    const { container } = render(<Separator />);
    const separator = container.firstChild as HTMLElement;
    expect(separator).toBeInTheDocument();
    expect(separator.className).toContain('h-[1px]');
    expect(separator.className).toContain('w-full');
  });

  it('renders a vertical separator', () => {
    const { container } = render(<Separator orientation="vertical" />);
    const separator = container.firstChild as HTMLElement;
    expect(separator.className).toContain('h-full');
    expect(separator.className).toContain('w-[1px]');
  });

  it('applies bg-border class', () => {
    const { container } = render(<Separator />);
    const separator = container.firstChild as HTMLElement;
    expect(separator.className).toContain('bg-border');
  });

  it('merges custom className', () => {
    const { container } = render(<Separator className="my-4" />);
    const separator = container.firstChild as HTMLElement;
    expect(separator.className).toContain('my-4');
  });
});
