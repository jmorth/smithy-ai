import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VersionHistory from '../version-history';
import type { WorkerVersion } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeVersion(overrides: Partial<WorkerVersion> = {}): WorkerVersion {
  return {
    id: 'wv-1',
    workerId: 'w-1',
    version: '1',
    yamlConfig: {
      name: 'Summarizer',
      inputTypes: ['text'],
      outputType: 'text',
      provider: { name: 'openai', model: 'gpt-4', apiKeyEnv: 'KEY' },
    },
    status: 'ACTIVE',
    createdAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

const VERSIONS: WorkerVersion[] = [
  makeVersion({ id: 'wv-1', version: '1', status: 'DEPRECATED', createdAt: '2026-01-01T12:00:00Z' }),
  makeVersion({ id: 'wv-2', version: '2', status: 'DEPRECATED', createdAt: '2026-01-10T12:00:00Z' }),
  makeVersion({ id: 'wv-3', version: '3', status: 'ACTIVE', createdAt: '2026-01-15T12:00:00Z' }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VersionHistory', () => {
  const onDeprecate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  describe('Rendering', () => {
    it('renders a table with version rows', () => {
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(4); // 1 header + 3 data
    });

    it('sorts versions descending (newest first)', () => {
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );
      const rows = screen.getAllByRole('row');
      // First data row should be v3
      expect(within(rows[1]!).getByText('v3')).toBeInTheDocument();
      // Last data row should be v1
      expect(within(rows[3]!).getByText('v1')).toBeInTheDocument();
    });

    it('renders version number', () => {
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );
      expect(screen.getByText('v3')).toBeInTheDocument();
      expect(screen.getByText('v2')).toBeInTheDocument();
      expect(screen.getByText('v1')).toBeInTheDocument();
    });

    it('renders status badges', () => {
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );
      expect(screen.getByText('Active')).toBeInTheDocument();
      const deprecatedBadges = screen.getAllByText('Deprecated');
      expect(deprecatedBadges).toHaveLength(2);
    });

    it('renders created at dates', () => {
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );
      // Dates may shift by timezone, so check that formatted dates are present
      const rows = screen.getAllByRole('row');
      // Each data row (rows 1-3) should have a date cell with "202" (year prefix)
      for (let i = 1; i <= 3; i++) {
        const cells = within(rows[i]!).getAllByRole('cell');
        // Date is the 3rd column (index 2)
        expect(cells[2]!.textContent).toMatch(/\w+ \d{1,2}, 2026/);
      }
    });

    it('renders empty state when no versions', () => {
      render(
        <VersionHistory versions={[]} onDeprecate={onDeprecate} />,
      );
      expect(screen.getByText('No versions yet')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Status badge colors
  // -----------------------------------------------------------------------

  describe('Status badge colors', () => {
    it('applies green classes for ACTIVE status', () => {
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );
      const badge = screen.getByText('Active');
      expect(badge.className).toContain('bg-green-100');
    });

    it('applies gray classes for DEPRECATED status', () => {
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );
      const badges = screen.getAllByText('Deprecated');
      expect(badges[0]!.className).toContain('bg-gray-100');
    });
  });

  // -----------------------------------------------------------------------
  // Deprecate action
  // -----------------------------------------------------------------------

  describe('Deprecate action', () => {
    it('shows Deprecate button only for ACTIVE versions', () => {
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );
      const deprecateButtons = screen.getAllByRole('button', {
        name: 'Deprecate',
      });
      // Only v3 is ACTIVE, so only one button
      expect(deprecateButtons).toHaveLength(1);
    });

    it('opens confirmation dialog when Deprecate is clicked', async () => {
      const user = userEvent.setup();
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );

      await user.click(screen.getByRole('button', { name: 'Deprecate' }));

      expect(screen.getByText('Deprecate Version')).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to deprecate version v3/),
      ).toBeInTheDocument();
    });

    it('calls onDeprecate when confirmed', async () => {
      const user = userEvent.setup();
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );

      await user.click(screen.getByRole('button', { name: 'Deprecate' }));

      // Click the confirm button in the dialog
      const dialogButtons = screen.getAllByRole('button', {
        name: 'Deprecate',
      });
      // The confirm button is the destructive one in the dialog
      const confirmBtn = dialogButtons.find((btn) =>
        btn.className.includes('destructive'),
      );
      expect(confirmBtn).toBeDefined();
      await user.click(confirmBtn!);

      expect(onDeprecate).toHaveBeenCalledWith(3);
    });

    it('closes dialog when Cancel is clicked', async () => {
      const user = userEvent.setup();
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );

      await user.click(screen.getByRole('button', { name: 'Deprecate' }));
      expect(screen.getByText('Deprecate Version')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(
        screen.queryByText('Deprecate Version'),
      ).not.toBeInTheDocument();
      expect(onDeprecate).not.toHaveBeenCalled();
    });

    it('disables buttons when isDeprecating is true', () => {
      render(
        <VersionHistory
          versions={VERSIONS}
          onDeprecate={onDeprecate}
          isDeprecating
        />,
      );
      const deprecateBtn = screen.getByRole('button', { name: 'Deprecate' });
      expect(deprecateBtn).toBeDisabled();
    });
  });

  // -----------------------------------------------------------------------
  // Column headers
  // -----------------------------------------------------------------------

  describe('Column headers', () => {
    it('renders Version, Status, Created At column headers', () => {
      render(
        <VersionHistory versions={VERSIONS} onDeprecate={onDeprecate} />,
      );
      expect(screen.getByText('Version')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Created At')).toBeInTheDocument();
    });
  });
});
