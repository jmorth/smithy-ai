import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import WorkerDetailPage from '../worker-detail';

describe('WorkerDetailPage', () => {
  it('renders with the slug parameter', () => {
    render(
      <MemoryRouter initialEntries={['/workers/summarizer']}>
        <Routes>
          <Route path="/workers/:slug" element={<WorkerDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Worker: summarizer' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Worker Detail')).toBeInTheDocument();
  });
});
