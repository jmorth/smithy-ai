import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFactoryStore } from '@/stores/factory.store';
import { WorkerDetailPanel } from '../worker-detail-panel';

describe('WorkerDetailPanel', () => {
  beforeEach(() => {
    useFactoryStore.setState({
      selectedMachine: null,
      selectedCrate: null,
      workerMachines: new Map(),
      packageCrates: new Map(),
      activeAnimations: new Set(),
      layoutData: null,
    });
  });

  function setMachineSelected(
    id: string,
    overrides: Partial<{
      name: string;
      state: string;
      workerId: string;
      tileX: number;
      tileY: number;
    }> = {},
  ) {
    const machines = new Map(useFactoryStore.getState().workerMachines);
    machines.set(id, {
      position: { tileX: overrides.tileX ?? 3, tileY: overrides.tileY ?? 5 },
      state: (overrides.state ?? 'WAITING') as import('@smithy/shared').WorkerState,
      workerId: overrides.workerId ?? 'wv-001',
      name: overrides.name ?? 'Summarizer',
    });
    useFactoryStore.setState({ selectedMachine: id, workerMachines: machines });
  }

  it('renders nothing when no machine is selected', () => {
    const { container } = render(<WorkerDetailPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when selected machine is not found in store', () => {
    useFactoryStore.setState({ selectedMachine: 'nonexistent' });
    const { container } = render(<WorkerDetailPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the panel when a machine is selected', () => {
    setMachineSelected('m1');
    render(<WorkerDetailPanel />);
    expect(screen.getByTestId('worker-detail-panel')).toBeInTheDocument();
  });

  it('displays the worker name', () => {
    setMachineSelected('m1', { name: 'Code Reviewer' });
    render(<WorkerDetailPanel />);
    expect(screen.getByText('Code Reviewer')).toBeInTheDocument();
  });

  it('displays a state badge', () => {
    setMachineSelected('m1', { state: 'WORKING' });
    render(<WorkerDetailPanel />);
    expect(screen.getByTestId('worker-state-badge')).toHaveTextContent(
      'WORKING',
    );
  });

  it('displays the worker ID', () => {
    setMachineSelected('m1', { workerId: 'wv-042' });
    render(<WorkerDetailPanel />);
    expect(screen.getByText('wv-042')).toBeInTheDocument();
  });

  it('shows an indeterminate progress bar when WORKING', () => {
    setMachineSelected('m1', { state: 'WORKING' });
    render(<WorkerDetailPanel />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('does not show progress bar when WAITING', () => {
    setMachineSelected('m1', { state: 'WAITING' });
    render(<WorkerDetailPanel />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows position information', () => {
    setMachineSelected('m1', { tileX: 7, tileY: 12 });
    render(<WorkerDetailPanel />);
    expect(screen.getByText('(7, 12)')).toBeInTheDocument();
  });

  it('has pointer-events-auto class', () => {
    setMachineSelected('m1');
    render(<WorkerDetailPanel />);
    expect(screen.getByTestId('worker-detail-panel').className).toContain(
      'pointer-events-auto',
    );
  });

  it('has correct ARIA attributes', () => {
    setMachineSelected('m1', { name: 'Summarizer' });
    render(<WorkerDetailPanel />);
    const panel = screen.getByTestId('worker-detail-panel');
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute('aria-label', 'Worker details: Summarizer');
  });

  it('close button clears selection', async () => {
    const user = userEvent.setup();
    setMachineSelected('m1');
    render(<WorkerDetailPanel />);

    await user.click(screen.getByTestId('close-worker-panel'));
    expect(useFactoryStore.getState().selectedMachine).toBeNull();
  });

  it('Escape key closes the panel', async () => {
    const user = userEvent.setup();
    setMachineSelected('m1');
    render(<WorkerDetailPanel />);

    await user.keyboard('{Escape}');
    expect(useFactoryStore.getState().selectedMachine).toBeNull();
  });

  it('is responsive with w-full and sm:w-96 classes', () => {
    setMachineSelected('m1');
    render(<WorkerDetailPanel />);
    const panel = screen.getByTestId('worker-detail-panel');
    expect(panel.className).toContain('w-full');
    expect(panel.className).toMatch(/sm:w-96/);
  });

  it('has semi-transparent background', () => {
    setMachineSelected('m1');
    render(<WorkerDetailPanel />);
    const panel = screen.getByTestId('worker-detail-panel');
    expect(panel.className).toMatch(/bg-background\/90/);
  });

  it('displays STUCK state badge', () => {
    setMachineSelected('m1', { state: 'STUCK' });
    render(<WorkerDetailPanel />);
    const badge = screen.getByTestId('worker-state-badge');
    expect(badge).toHaveTextContent('STUCK');
  });

  it('displays ERROR state badge', () => {
    setMachineSelected('m1', { state: 'ERROR' });
    render(<WorkerDetailPanel />);
    const badge = screen.getByTestId('worker-state-badge');
    expect(badge).toHaveTextContent('ERROR');
  });

  it('displays DONE state badge', () => {
    setMachineSelected('m1', { state: 'DONE' });
    render(<WorkerDetailPanel />);
    const badge = screen.getByTestId('worker-state-badge');
    expect(badge).toHaveTextContent('DONE');
  });
});
