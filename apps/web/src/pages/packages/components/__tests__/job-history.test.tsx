import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { JobHistory } from '../job-history';
import type { JobExecution } from '@smithy/shared';

function makeJob(overrides: Partial<JobExecution> = {}): JobExecution {
  return {
    id: 'j1',
    packageId: 'pkg-1',
    workerVersionId: 'summarizer:2',
    status: 'COMPLETED',
    containerId: 'docker-abc123',
    startedAt: '2026-01-15T10:00:00Z',
    completedAt: '2026-01-15T10:05:00Z',
    errorMessage: undefined,
    retryCount: 0,
    logs: ['line1', 'line2'],
    createdAt: '2026-01-15T09:59:00Z',
    ...overrides,
  };
}

describe('JobHistory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows no jobs message when empty', () => {
    render(<JobHistory jobs={[]} />);
    expect(screen.getByTestId('no-jobs')).toBeInTheDocument();
  });

  it('renders job entries', () => {
    render(<JobHistory jobs={[makeJob()]} />);
    expect(screen.getByTestId('job-j1')).toBeInTheDocument();
  });

  it('shows worker name extracted from workerVersionId', () => {
    render(<JobHistory jobs={[makeJob()]} />);
    expect(screen.getByText('summarizer')).toBeInTheDocument();
  });

  it('shows truncated job ID', () => {
    render(<JobHistory jobs={[makeJob({ id: 'abcdefgh-ijkl-mnop' })]} />);
    expect(screen.getByText('abcdefgh')).toBeInTheDocument();
  });

  it('marks first (newest) job as Latest', () => {
    render(
      <JobHistory
        jobs={[
          makeJob({ id: 'j1', createdAt: '2026-01-15T10:00:00Z' }),
          makeJob({ id: 'j2', createdAt: '2026-01-15T11:00:00Z' }),
        ]}
      />,
    );
    // j2 is newer, should be first and marked Latest
    const j2 = screen.getByTestId('job-j2');
    expect(within(j2).getByText('Latest')).toBeInTheDocument();
  });

  it('sorts jobs newest first', () => {
    render(
      <JobHistory
        jobs={[
          makeJob({ id: 'j-old', createdAt: '2026-01-01T00:00:00Z' }),
          makeJob({ id: 'j-new', createdAt: '2026-01-15T00:00:00Z' }),
        ]}
      />,
    );
    const container = screen.getByTestId('job-history');
    const entries = container.querySelectorAll('[data-testid^="job-j"]');
    expect(entries[0]).toHaveAttribute('data-testid', 'job-j-new');
    expect(entries[1]).toHaveAttribute('data-testid', 'job-j-old');
  });

  it('shows status badge', () => {
    render(<JobHistory jobs={[makeJob({ status: 'ERROR' })]} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('shows QUEUED status', () => {
    render(<JobHistory jobs={[makeJob({ status: 'QUEUED' })]} />);
    expect(screen.getByText('Queued')).toBeInTheDocument();
  });

  it('shows RUNNING status', () => {
    render(<JobHistory jobs={[makeJob({ status: 'RUNNING' })]} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows STUCK status', () => {
    render(<JobHistory jobs={[makeJob({ status: 'STUCK' })]} />);
    expect(screen.getByText('Stuck')).toBeInTheDocument();
  });

  it('shows CANCELLED status', () => {
    render(<JobHistory jobs={[makeJob({ status: 'CANCELLED' })]} />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('shows unknown status as-is', () => {
    render(<JobHistory jobs={[makeJob({ status: 'CUSTOM' as never })]} />);
    expect(screen.getByText('CUSTOM')).toBeInTheDocument();
  });

  it('shows retry count when > 0', () => {
    render(<JobHistory jobs={[makeJob({ retryCount: 3 })]} />);
    expect(screen.getByText('Retries: 3')).toBeInTheDocument();
  });

  it('does not show retry count when 0', () => {
    render(<JobHistory jobs={[makeJob({ retryCount: 0 })]} />);
    expect(screen.queryByText(/Retries:/)).not.toBeInTheDocument();
  });

  it('shows running duration text for RUNNING jobs', () => {
    render(
      <JobHistory
        jobs={[
          makeJob({
            id: 'j-run',
            status: 'RUNNING',
            startedAt: '2026-01-15T10:00:00Z',
            completedAt: undefined,
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('job-duration-j-run')).toHaveTextContent(
      '(running)',
    );
  });

  it('shows duration for completed jobs', () => {
    render(
      <JobHistory
        jobs={[
          makeJob({
            startedAt: '2026-01-15T10:00:00Z',
            completedAt: '2026-01-15T10:05:30Z',
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('job-duration-j1')).toHaveTextContent('5m 30s');
  });

  it('expands details when clicked', async () => {
    const user = userEvent.setup();
    render(<JobHistory jobs={[makeJob()]} />);

    await user.click(screen.getByTestId('job-toggle-j1'));
    const details = screen.getByTestId('job-details-j1');
    expect(details).toBeInTheDocument();
    expect(within(details).getByText('summarizer:2')).toBeInTheDocument();
  });

  it('collapses details on second click', async () => {
    const user = userEvent.setup();
    render(<JobHistory jobs={[makeJob()]} />);

    await user.click(screen.getByTestId('job-toggle-j1'));
    expect(screen.getByTestId('job-details-j1')).toBeInTheDocument();

    await user.click(screen.getByTestId('job-toggle-j1'));
    expect(screen.queryByTestId('job-details-j1')).not.toBeInTheDocument();
  });

  it('shows container ID in details', async () => {
    const user = userEvent.setup();
    render(<JobHistory jobs={[makeJob()]} />);

    await user.click(screen.getByTestId('job-toggle-j1'));
    expect(screen.getByText('docker-abc12')).toBeInTheDocument();
  });

  it('does not show container when absent', async () => {
    const user = userEvent.setup();
    render(
      <JobHistory
        jobs={[makeJob({ containerId: undefined })]}
      />,
    );

    await user.click(screen.getByTestId('job-toggle-j1'));
    expect(screen.queryByText('Container')).not.toBeInTheDocument();
  });

  it('shows error message in details', async () => {
    const user = userEvent.setup();
    render(
      <JobHistory
        jobs={[makeJob({ errorMessage: 'OutOfMemory', status: 'ERROR' })]}
      />,
    );

    await user.click(screen.getByTestId('job-toggle-j1'));
    expect(screen.getByText('OutOfMemory')).toBeInTheDocument();
  });

  it('shows log output in details', async () => {
    const user = userEvent.setup();
    render(<JobHistory jobs={[makeJob()]} />);

    await user.click(screen.getByTestId('job-toggle-j1'));
    expect(screen.getByText(/line1/)).toBeInTheDocument();
  });

  it('handles object logs by stringifying', async () => {
    const user = userEvent.setup();
    render(
      <JobHistory
        jobs={[makeJob({ logs: [{ level: 'info', msg: 'hello' }] })]}
      />,
    );

    await user.click(screen.getByTestId('job-toggle-j1'));
    expect(screen.getByText(/hello/)).toBeInTheDocument();
  });

  it('does not show logs when empty', async () => {
    const user = userEvent.setup();
    render(<JobHistory jobs={[makeJob({ logs: [] })]} />);

    await user.click(screen.getByTestId('job-toggle-j1'));
    expect(screen.queryByText('Log output:')).not.toBeInTheDocument();
  });

  it('applies animate-pulse to RUNNING timeline dot', () => {
    render(
      <JobHistory
        jobs={[makeJob({ id: 'j-run', status: 'RUNNING' })]}
      />,
    );
    const dot = screen.getByTestId('job-dot-j-run');
    expect(dot.className).toContain('animate-pulse');
    expect(dot.className).toContain('border-blue-500');
  });

  it('applies green border to COMPLETED timeline dot', () => {
    render(<JobHistory jobs={[makeJob()]} />);
    const dot = screen.getByTestId('job-dot-j1');
    expect(dot.className).toContain('border-green-500');
  });

  it('applies red border to ERROR timeline dot', () => {
    render(
      <JobHistory
        jobs={[makeJob({ id: 'j-err', status: 'ERROR' })]}
      />,
    );
    const dot = screen.getByTestId('job-dot-j-err');
    expect(dot.className).toContain('border-red-500');
  });

  it('applies amber border to STUCK timeline dot', () => {
    render(
      <JobHistory
        jobs={[makeJob({ id: 'j-stuck', status: 'STUCK' })]}
      />,
    );
    const dot = screen.getByTestId('job-dot-j-stuck');
    expect(dot.className).toContain('border-amber-500');
  });

  it('formats hours in duration', () => {
    render(
      <JobHistory
        jobs={[
          makeJob({
            startedAt: '2026-01-15T10:00:00Z',
            completedAt: '2026-01-15T12:30:00Z',
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('job-duration-j1')).toHaveTextContent('2h 30m');
  });

  it('formats seconds-only duration', () => {
    render(
      <JobHistory
        jobs={[
          makeJob({
            startedAt: '2026-01-15T10:00:00Z',
            completedAt: '2026-01-15T10:00:45Z',
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('job-duration-j1')).toHaveTextContent('45s');
  });

  it('does not show started/duration when no startedAt', () => {
    render(
      <JobHistory
        jobs={[makeJob({ id: 'j-q', status: 'QUEUED', startedAt: undefined })]}
      />,
    );
    expect(screen.queryByTestId('job-duration-j-q')).not.toBeInTheDocument();
  });
});
