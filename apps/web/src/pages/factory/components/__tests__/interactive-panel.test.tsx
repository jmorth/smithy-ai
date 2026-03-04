import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFactoryStore } from '@/stores/factory.store';
import { InteractivePanel } from '../interactive-panel';
import { socketManager } from '@/api/socket';

vi.mock('@/api/socket', () => ({
  socketManager: {
    sendInteractiveResponse: vi.fn(),
    getOrCreateSocket: vi.fn(),
    onEvent: vi.fn(() => vi.fn()),
    connect: vi.fn(),
  },
}));

describe('InteractivePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFactoryStore.setState({
      selectedMachine: null,
      selectedCrate: null,
      workerMachines: new Map(),
      packageCrates: new Map(),
      activeAnimations: new Set(),
      layoutData: null,
    });
  });

  function addStuckWorker(machineId: string, name = 'Summarizer') {
    const machines = new Map(useFactoryStore.getState().workerMachines);
    machines.set(machineId, {
      position: { tileX: 3, tileY: 5 },
      state: 'STUCK' as import('@smithy/shared').WorkerState,
      workerId: 'wv-001',
      name,
    });
    useFactoryStore.setState({ workerMachines: machines });
  }

  it('renders nothing when no workers are STUCK', () => {
    const { container } = render(<InteractivePanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when workers exist but none are STUCK', () => {
    const machines = new Map();
    machines.set('m1', {
      position: { tileX: 3, tileY: 5 },
      state: 'WORKING',
      workerId: 'wv-001',
      name: 'Test Worker',
    });
    useFactoryStore.setState({ workerMachines: machines });

    const { container } = render(<InteractivePanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the panel when a worker is STUCK', () => {
    addStuckWorker('m1');
    render(<InteractivePanel />);
    expect(screen.getByTestId('interactive-panel')).toBeInTheDocument();
  });

  it('shows stuck worker name', () => {
    addStuckWorker('m1', 'Code Reviewer');
    render(<InteractivePanel />);
    expect(screen.getAllByText(/Code Reviewer/).length).toBeGreaterThan(0);
  });

  it('shows the default question prompt', () => {
    addStuckWorker('m1');
    render(<InteractivePanel />);
    expect(
      screen.getByText(/needs your input to continue/),
    ).toBeInTheDocument();
  });

  it('has pointer-events-auto class', () => {
    addStuckWorker('m1');
    render(<InteractivePanel />);
    expect(screen.getByTestId('interactive-panel').className).toContain(
      'pointer-events-auto',
    );
  });

  it('has role="alertdialog"', () => {
    addStuckWorker('m1');
    render(<InteractivePanel />);
    expect(screen.getByTestId('interactive-panel')).toHaveAttribute(
      'role',
      'alertdialog',
    );
  });

  it('submit button is disabled when answer is empty', () => {
    addStuckWorker('m1');
    render(<InteractivePanel />);
    expect(screen.getByTestId('interactive-submit')).toBeDisabled();
  });

  it('submit button is disabled for whitespace-only input', async () => {
    const user = userEvent.setup();
    addStuckWorker('m1');
    render(<InteractivePanel />);

    await user.type(screen.getByTestId('interactive-input'), '   ');
    expect(screen.getByTestId('interactive-submit')).toBeDisabled();
  });

  it('calls socketManager.sendInteractiveResponse on submit', async () => {
    const user = userEvent.setup();
    addStuckWorker('m1');
    render(<InteractivePanel />);

    await user.type(screen.getByTestId('interactive-input'), 'Use JSON');
    await user.click(screen.getByTestId('interactive-submit'));

    expect(socketManager.sendInteractiveResponse).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ answer: 'Use JSON' }),
    );
  });

  it('shows confirmation after submission', async () => {
    const user = userEvent.setup();
    addStuckWorker('m1');
    render(<InteractivePanel />);

    await user.type(screen.getByTestId('interactive-input'), 'yes');
    await user.click(screen.getByTestId('interactive-submit'));

    expect(screen.getByTestId('interactive-confirmation')).toBeInTheDocument();
  });

  it('close button dismisses the panel', async () => {
    const user = userEvent.setup();
    addStuckWorker('m1');
    render(<InteractivePanel />);

    await user.click(screen.getByTestId('close-interactive-panel'));
    expect(screen.queryByTestId('interactive-panel')).not.toBeInTheDocument();
  });

  it('Escape key dismisses the panel', async () => {
    const user = userEvent.setup();
    addStuckWorker('m1');
    render(<InteractivePanel />);

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('interactive-panel')).not.toBeInTheDocument();
  });

  it('handles multiple stuck workers - shows first one', () => {
    addStuckWorker('m1', 'First Worker');
    addStuckWorker('m2', 'Second Worker');
    render(<InteractivePanel />);
    // Should show at least one stuck worker
    expect(screen.getByTestId('interactive-panel')).toBeInTheDocument();
  });

  it('re-shows panel when a different stuck worker appears after dismissal', async () => {
    const user = userEvent.setup();
    addStuckWorker('m1', 'First');
    const { rerender } = render(<InteractivePanel />);
    await user.click(screen.getByTestId('close-interactive-panel'));
    expect(screen.queryByTestId('interactive-panel')).not.toBeInTheDocument();

    // Fix m1, new stuck worker m2 appears
    const machines = new Map(useFactoryStore.getState().workerMachines);
    machines.set('m1', { ...machines.get('m1')!, state: 'WAITING' as import('@smithy/shared').WorkerState });
    machines.set('m2', {
      position: { tileX: 5, tileY: 7 },
      state: 'STUCK' as import('@smithy/shared').WorkerState,
      workerId: 'wv-002',
      name: 'Second',
    });
    useFactoryStore.setState({ workerMachines: machines });
    rerender(<InteractivePanel />);
    expect(screen.getByTestId('interactive-panel')).toBeInTheDocument();
  });

  it('is centered on screen', () => {
    addStuckWorker('m1');
    render(<InteractivePanel />);
    const panel = screen.getByTestId('interactive-panel');
    expect(panel.className).toContain('inset-0');
    expect(panel.className).toContain('flex');
    expect(panel.className).toContain('items-center');
    expect(panel.className).toContain('justify-center');
  });
});
