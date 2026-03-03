import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatsCards } from '../components/stats-cards';
import type { DashboardStats } from '@/api/hooks/use-dashboard-stats';

const mockData: DashboardStats = {
  activeAssemblyLines: 5,
  activeWorkerPools: 3,
  inTransitPackages: 12,
  runningContainers: { used: 8, max: 20 },
};

describe('StatsCards', () => {
  it('renders all four stat cards with correct values', () => {
    render(<StatsCards data={mockData} isLoading={false} error={null} />);

    expect(screen.getByText('Active Assembly Lines')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    expect(screen.getByText('Active Worker Pools')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    expect(screen.getByText('In-Transit Packages')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    expect(screen.getByText('Running Containers')).toBeInTheDocument();
    expect(screen.getByText('8/20')).toBeInTheDocument();
  });

  it('renders loading skeletons when isLoading is true', () => {
    const { container } = render(
      <StatsCards data={undefined} isLoading={true} error={null} />,
    );

    const skeletons = container.querySelectorAll('.animate-pulse');
    // 4 skeleton cards × 3 animated elements each = 12
    expect(skeletons.length).toBe(12);
  });

  it('renders loading skeletons when data is undefined', () => {
    const { container } = render(
      <StatsCards data={undefined} isLoading={false} error={null} />,
    );

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(12);
  });

  it('renders error state when error is provided', () => {
    const error = new Error('Network failure');
    render(<StatsCards data={undefined} isLoading={false} error={error} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText('Failed to load dashboard stats: Network failure'),
    ).toBeInTheDocument();
  });

  it('prioritizes error state over loading state', () => {
    const error = new Error('Server error');
    render(<StatsCards data={undefined} isLoading={true} error={error} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders zero values correctly', () => {
    const zeroData: DashboardStats = {
      activeAssemblyLines: 0,
      activeWorkerPools: 0,
      inTransitPackages: 0,
      runningContainers: { used: 0, max: 0 },
    };
    render(<StatsCards data={zeroData} isLoading={false} error={null} />);

    expect(screen.getByText('Active Assembly Lines')).toBeInTheDocument();
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });

  it('renders responsive grid classes', () => {
    const { container } = render(
      <StatsCards data={mockData} isLoading={false} error={null} />,
    );

    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-4');
  });
});
