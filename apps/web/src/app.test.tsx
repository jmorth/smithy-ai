import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect } from 'vitest';
import App from './app';

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
  it('renders the dashboard heading on the home route', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Smithy AI Dashboard');
  });

  it('renders the placeholder text', () => {
    renderApp();
    expect(screen.getByText('Frontend dashboard coming soon.')).toBeInTheDocument();
  });

  it('renders a main element', () => {
    renderApp();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders the home route for the root path', () => {
    renderApp(['/']);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Smithy AI Dashboard');
  });
});
