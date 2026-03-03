import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import WorkerPoolDetailPage from '../worker-pool-detail';

describe('WorkerPoolDetailPage', () => {
  it('renders with the slug parameter', () => {
    render(
      <MemoryRouter initialEntries={['/worker-pools/gpu-pool']}>
        <Routes>
          <Route path="/worker-pools/:slug" element={<WorkerPoolDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Worker Pool: gpu-pool' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Worker Pool Detail')).toBeInTheDocument();
  });
});
