import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import WorkerPoolListPage from '../worker-pool-list';
import WorkerPoolCreatePage from '../worker-pool-create';
import PackageListPage from '../package-list';
import WorkerListPage from '../worker-list';
import LogViewerPage from '../log-viewer';
import FactoryPage from '../factory';

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// AssemblyLineListPage and AssemblyLineCreatePage have dedicated test suites.

describe('WorkerPoolListPage', () => {
  it('renders heading and coming soon text', () => {
    renderInRouter(<WorkerPoolListPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Worker Pools' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Worker Pools')).toBeInTheDocument();
  });
});

describe('WorkerPoolCreatePage', () => {
  it('renders heading and coming soon text', () => {
    renderInRouter(<WorkerPoolCreatePage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Create Worker Pool' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Worker Pool Creation')).toBeInTheDocument();
  });
});

describe('PackageListPage', () => {
  it('renders heading and coming soon text', () => {
    renderInRouter(<PackageListPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Packages' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Packages')).toBeInTheDocument();
  });
});

describe('WorkerListPage', () => {
  it('renders heading and coming soon text', () => {
    renderInRouter(<WorkerListPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Workers' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Workers')).toBeInTheDocument();
  });
});

describe('LogViewerPage', () => {
  it('renders heading and coming soon text', () => {
    renderInRouter(<LogViewerPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Logs' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Log Viewer')).toBeInTheDocument();
  });
});

describe('FactoryPage', () => {
  it('renders heading and coming soon text', () => {
    renderInRouter(<FactoryPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Factory' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon: Factory View')).toBeInTheDocument();
  });
});
