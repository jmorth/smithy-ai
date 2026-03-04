import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { useFactoryStore } from '@/stores/factory.store';
import { PackageDetailPanel } from '../package-detail-panel';

describe('PackageDetailPanel', () => {
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

  function setCrateSelected(
    id: string,
    overrides: Partial<{
      type: string;
      status: string;
      currentStep: number;
      tileX: number;
      tileY: number;
    }> = {},
  ) {
    const crates = new Map(useFactoryStore.getState().packageCrates);
    crates.set(id, {
      position: { tileX: overrides.tileX ?? 4, tileY: overrides.tileY ?? 6 },
      type: (overrides.type ?? 'USER_INPUT') as import('@smithy/shared').PackageType,
      status: (overrides.status ?? 'PENDING') as import('@smithy/shared').PackageStatus,
      currentStep: overrides.currentStep ?? 1,
    });
    useFactoryStore.setState({ selectedCrate: id, packageCrates: crates });
  }

  it('renders nothing when no crate is selected', () => {
    const { container } = render(<PackageDetailPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when selected crate is not found in store', () => {
    useFactoryStore.setState({ selectedCrate: 'nonexistent' });
    const { container } = render(<PackageDetailPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the panel when a crate is selected', () => {
    setCrateSelected('c1');
    render(<PackageDetailPanel />);
    expect(screen.getByTestId('package-detail-panel')).toBeInTheDocument();
  });

  it('displays the package type', () => {
    setCrateSelected('c1', { type: 'CODE' });
    render(<PackageDetailPanel />);
    expect(screen.getByTestId('package-type-badge')).toHaveTextContent('CODE');
  });

  it('displays the package status', () => {
    setCrateSelected('c1', { status: 'PROCESSING' });
    render(<PackageDetailPanel />);
    expect(screen.getByTestId('package-status-badge')).toHaveTextContent(
      'PROCESSING',
    );
  });

  it('displays the current step', () => {
    setCrateSelected('c1', { currentStep: 3 });
    render(<PackageDetailPanel />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('displays position information', () => {
    setCrateSelected('c1', { tileX: 9, tileY: 2 });
    render(<PackageDetailPanel />);
    expect(screen.getByText('(9, 2)')).toBeInTheDocument();
  });

  it('has pointer-events-auto class', () => {
    setCrateSelected('c1');
    render(<PackageDetailPanel />);
    expect(screen.getByTestId('package-detail-panel').className).toContain(
      'pointer-events-auto',
    );
  });

  it('has correct ARIA attributes', () => {
    setCrateSelected('c1', { type: 'SPECIFICATION' });
    render(<PackageDetailPanel />);
    const panel = screen.getByTestId('package-detail-panel');
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute(
      'aria-label',
      'Package details: SPECIFICATION',
    );
  });

  it('close button clears selection', async () => {
    const user = userEvent.setup();
    setCrateSelected('c1');
    render(<PackageDetailPanel />);

    await user.click(screen.getByTestId('close-package-panel'));
    expect(useFactoryStore.getState().selectedCrate).toBeNull();
  });

  it('Escape key closes the panel', async () => {
    const user = userEvent.setup();
    setCrateSelected('c1');
    render(<PackageDetailPanel />);

    await user.keyboard('{Escape}');
    expect(useFactoryStore.getState().selectedCrate).toBeNull();
  });

  it('is responsive with w-full and sm:w-96 classes', () => {
    setCrateSelected('c1');
    render(<PackageDetailPanel />);
    const panel = screen.getByTestId('package-detail-panel');
    expect(panel.className).toContain('w-full');
    expect(panel.className).toMatch(/sm:w-96/);
  });

  it('has semi-transparent background', () => {
    setCrateSelected('c1');
    render(<PackageDetailPanel />);
    const panel = screen.getByTestId('package-detail-panel');
    expect(panel.className).toMatch(/bg-background\/90/);
  });

  it('shows file list placeholder', () => {
    setCrateSelected('c1');
    render(<PackageDetailPanel />);
    expect(screen.getByText('Files')).toBeInTheDocument();
  });

  it('displays all package types with correct badge text', () => {
    const types = ['USER_INPUT', 'SPECIFICATION', 'CODE', 'IMAGE', 'PULL_REQUEST'];
    for (const type of types) {
      setCrateSelected('c1', { type });
      const { unmount } = render(<PackageDetailPanel />);
      expect(screen.getByTestId('package-type-badge')).toHaveTextContent(type);
      unmount();
    }
  });
});
