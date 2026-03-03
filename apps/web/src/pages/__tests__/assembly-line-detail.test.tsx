import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import AssemblyLineDetailPage from '../assembly-line-detail';

describe('AssemblyLineDetailPage', () => {
  it('renders with the slug parameter', () => {
    render(
      <MemoryRouter initialEntries={['/assembly-lines/my-pipeline']}>
        <Routes>
          <Route path="/assembly-lines/:slug" element={<AssemblyLineDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Assembly Line: my-pipeline' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Assembly Line Detail')).toBeInTheDocument();
  });
});
