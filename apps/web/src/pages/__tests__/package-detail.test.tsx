import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import PackageDetailPage from '../package-detail';

describe('PackageDetailPage', () => {
  it('renders with the id parameter', () => {
    render(
      <MemoryRouter initialEntries={['/packages/abc-123']}>
        <Routes>
          <Route path="/packages/:id" element={<PackageDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Package: abc-123' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Package Detail')).toBeInTheDocument();
  });
});
