import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Input } from '../input';

describe('Input', () => {
  it('renders an input element', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('applies input styling', () => {
    render(<Input data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input.className).toContain('border-input');
    expect(input.className).toContain('rounded-md');
  });

  it('passes type prop', () => {
    render(<Input type="password" data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'password');
  });

  it('merges custom className', () => {
    render(<Input className="custom" data-testid="input" />);
    expect(screen.getByTestId('input').className).toContain('custom');
  });

  it('supports disabled state', () => {
    render(<Input disabled data-testid="input" />);
    expect(screen.getByTestId('input')).toBeDisabled();
  });
});
