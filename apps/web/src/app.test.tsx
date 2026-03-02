import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './app';

describe('App', () => {
  it('renders the dashboard heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Smithy AI Dashboard');
  });

  it('renders the placeholder text', () => {
    render(<App />);
    expect(screen.getByText('Frontend dashboard coming soon.')).toBeInTheDocument();
  });

  it('renders a main element', () => {
    render(<App />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
