import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from '../button';

describe('Button', () => {
  it('renders with default variant and size', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('bg-primary');
    expect(button.className).toContain('h-10');
  });

  it('renders destructive variant', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button.className).toContain('bg-destructive');
  });

  it('renders outline variant', () => {
    render(<Button variant="outline">Outline</Button>);
    const button = screen.getByRole('button', { name: 'Outline' });
    expect(button.className).toContain('border');
  });

  it('renders secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const button = screen.getByRole('button', { name: 'Secondary' });
    expect(button.className).toContain('bg-secondary');
  });

  it('renders ghost variant', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const button = screen.getByRole('button', { name: 'Ghost' });
    expect(button.className).toContain('hover:bg-accent');
  });

  it('renders link variant', () => {
    render(<Button variant="link">Link</Button>);
    const button = screen.getByRole('button', { name: 'Link' });
    expect(button.className).toContain('underline-offset-4');
  });

  it('renders small size', () => {
    render(<Button size="sm">Small</Button>);
    const button = screen.getByRole('button', { name: 'Small' });
    expect(button.className).toContain('h-9');
  });

  it('renders large size', () => {
    render(<Button size="lg">Large</Button>);
    const button = screen.getByRole('button', { name: 'Large' });
    expect(button.className).toContain('h-11');
  });

  it('renders icon size', () => {
    render(<Button size="icon">X</Button>);
    const button = screen.getByRole('button', { name: 'X' });
    expect(button.className).toContain('w-10');
  });

  it('merges custom className', () => {
    render(<Button className="custom-class">Merge</Button>);
    const button = screen.getByRole('button', { name: 'Merge' });
    expect(button.className).toContain('custom-class');
  });

  it('renders as child when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Link Button' });
    expect(link).toBeInTheDocument();
    expect(link.className).toContain('bg-primary');
  });

  it('passes disabled attribute', () => {
    render(<Button disabled>Disabled</Button>);
    const button = screen.getByRole('button', { name: 'Disabled' });
    expect(button).toBeDisabled();
  });
});
