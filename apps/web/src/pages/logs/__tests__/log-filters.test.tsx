import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import LogFilters, { DEFAULT_FILTER_STATE, type LogFilterState } from '../components/log-filters';

function renderFilters(
  overrides: Partial<LogFilterState> = {},
  onChange = vi.fn(),
) {
  const filters = { ...DEFAULT_FILTER_STATE, ...overrides };
  render(<LogFilters filters={filters} onChange={onChange} />);
  return { onChange, filters };
}

describe('LogFilters', () => {
  // -------------------------------------------------------------------------
  // Level checkboxes
  // -------------------------------------------------------------------------

  describe('Level checkboxes', () => {
    it('renders all four level buttons', () => {
      renderFilters();
      expect(screen.getByRole('checkbox', { name: 'Debug level' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Info level' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Warning level' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Error level' })).toBeInTheDocument();
    });

    it('marks all levels as checked by default', () => {
      renderFilters();
      expect(screen.getByRole('checkbox', { name: 'Debug level' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('checkbox', { name: 'Info level' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('checkbox', { name: 'Warning level' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('checkbox', { name: 'Error level' })).toHaveAttribute('aria-checked', 'true');
    });

    it('shows unchecked state when level is disabled', () => {
      renderFilters({ levels: { debug: false, info: true, warning: true, error: true } });
      expect(screen.getByRole('checkbox', { name: 'Debug level' })).toHaveAttribute('aria-checked', 'false');
    });

    it('toggles level when clicked', async () => {
      const user = userEvent.setup();
      const { onChange } = renderFilters();

      await user.click(screen.getByRole('checkbox', { name: 'Debug level' }));

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          levels: { debug: false, info: true, warning: true, error: true },
        }),
      );
    });

    it('re-enables a disabled level when clicked', async () => {
      const user = userEvent.setup();
      const { onChange } = renderFilters({
        levels: { debug: false, info: true, warning: true, error: true },
      });

      await user.click(screen.getByRole('checkbox', { name: 'Debug level' }));

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          levels: { debug: true, info: true, warning: true, error: true },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  describe('Search', () => {
    it('renders search input', () => {
      renderFilters();
      expect(screen.getByLabelText('Search logs')).toBeInTheDocument();
    });

    it('calls onChange when search text changes', async () => {
      const user = userEvent.setup();
      const { onChange } = renderFilters();

      await user.type(screen.getByLabelText('Search logs'), 'e');

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'e' }),
      );
    });

    it('shows hide non-matching toggle when search has value', () => {
      renderFilters({ search: 'test' });
      expect(screen.getByText('Hide non-matching')).toBeInTheDocument();
    });

    it('does not show hide non-matching toggle when search is empty', () => {
      renderFilters({ search: '' });
      expect(screen.queryByText('Hide non-matching')).not.toBeInTheDocument();
    });

    it('toggles hide non-matching', async () => {
      const user = userEvent.setup();
      const { onChange } = renderFilters({ search: 'test', hideNonMatching: false });

      await user.click(screen.getByText('Hide non-matching'));

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ hideNonMatching: true }),
      );
    });

    it('shows "Show all" when hideNonMatching is true', () => {
      renderFilters({ search: 'test', hideNonMatching: true });
      expect(screen.getByText('Show all')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Timestamp range
  // -------------------------------------------------------------------------

  describe('Timestamp range', () => {
    it('renders after and before inputs', () => {
      renderFilters();
      expect(screen.getByLabelText('After')).toBeInTheDocument();
      expect(screen.getByLabelText('Before')).toBeInTheDocument();
    });

    it('calls onChange when after value changes', async () => {
      const user = userEvent.setup();
      const { onChange } = renderFilters();

      const afterInput = screen.getByLabelText('After');
      await user.type(afterInput, '2026-01-01T00:00');

      expect(onChange).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Clear filters
  // -------------------------------------------------------------------------

  describe('Clear filters', () => {
    it('shows clear button when filters are active', () => {
      renderFilters({ search: 'test' });
      expect(screen.getByLabelText('Clear filters')).toBeInTheDocument();
    });

    it('does not show clear button when no filters are active', () => {
      renderFilters();
      expect(screen.queryByLabelText('Clear filters')).not.toBeInTheDocument();
    });

    it('shows clear button when a level is unchecked', () => {
      renderFilters({ levels: { debug: false, info: true, warning: true, error: true } });
      expect(screen.getByLabelText('Clear filters')).toBeInTheDocument();
    });

    it('shows clear button when timestamp range is set', () => {
      renderFilters({ after: '2026-01-01T00:00' });
      expect(screen.getByLabelText('Clear filters')).toBeInTheDocument();
    });

    it('resets all filters when clear is clicked', async () => {
      const user = userEvent.setup();
      const { onChange } = renderFilters({ search: 'test' });

      await user.click(screen.getByLabelText('Clear filters'));

      expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTER_STATE);
    });
  });
});
