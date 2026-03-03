import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PoolStatus } from '../pool-status';

describe('PoolStatus', () => {
  it('renders active jobs and max concurrency text', () => {
    render(<PoolStatus activeJobs={3} maxConcurrency={10} />);
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });

  it('renders percentage', () => {
    render(<PoolStatus activeJobs={3} maxConcurrency={10} />);
    expect(screen.getByTestId('pool-pct')).toHaveTextContent('30%');
  });

  it('renders a progressbar with correct aria attributes', () => {
    render(<PoolStatus activeJobs={7} maxConcurrency={10} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '70');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('uses green color for utilization under 70%', () => {
    const { container } = render(<PoolStatus activeJobs={5} maxConcurrency={10} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.className).toContain('bg-green-100');
    const fill = bar?.firstElementChild;
    expect(fill?.className).toContain('bg-green-500');
  });

  it('uses yellow color for utilization between 70% and 90%', () => {
    const { container } = render(<PoolStatus activeJobs={8} maxConcurrency={10} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.className).toContain('bg-yellow-100');
    const fill = bar?.firstElementChild;
    expect(fill?.className).toContain('bg-yellow-500');
  });

  it('uses red color for utilization above 90%', () => {
    const { container } = render(<PoolStatus activeJobs={10} maxConcurrency={10} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.className).toContain('bg-red-100');
    const fill = bar?.firstElementChild;
    expect(fill?.className).toContain('bg-red-500');
  });

  it('handles zero max concurrency gracefully', () => {
    render(<PoolStatus activeJobs={0} maxConcurrency={0} />);
    expect(screen.getByTestId('pool-pct')).toHaveTextContent('0%');
  });

  it('caps percentage at 100%', () => {
    render(<PoolStatus activeJobs={15} maxConcurrency={10} />);
    expect(screen.getByTestId('pool-pct')).toHaveTextContent('100%');
  });

  it('renders 0% when no active jobs', () => {
    render(<PoolStatus activeJobs={0} maxConcurrency={10} />);
    expect(screen.getByTestId('pool-pct')).toHaveTextContent('0%');
  });

  it('renders exact 70% boundary as yellow', () => {
    const { container } = render(<PoolStatus activeJobs={7} maxConcurrency={10} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.className).toContain('bg-yellow-100');
  });

  it('renders 69% as green', () => {
    // 69/100 = 69%
    const { container } = render(<PoolStatus activeJobs={69} maxConcurrency={100} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.className).toContain('bg-green-100');
  });

  it('renders 91% as red', () => {
    // 91/100 = 91%
    const { container } = render(<PoolStatus activeJobs={91} maxConcurrency={100} />);
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.className).toContain('bg-red-100');
  });
});
