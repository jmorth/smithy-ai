import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Sidebar, MobileSidebarTrigger, NAV_LINKS, FACTORY_LINK } from './sidebar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSidebar(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Sidebar />
    </MemoryRouter>,
  );
}

function renderMobileTrigger(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <MobileSidebarTrigger />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests — Sidebar
// ---------------------------------------------------------------------------

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('rendering', () => {
    it('renders the desktop sidebar', () => {
      renderSidebar();
      expect(screen.getByTestId('desktop-sidebar')).toBeInTheDocument();
    });

    it('renders all main navigation links', () => {
      renderSidebar();
      for (const link of NAV_LINKS) {
        expect(screen.getByRole('link', { name: link.label })).toBeInTheDocument();
      }
    });

    it('renders the Factory link', () => {
      renderSidebar();
      expect(screen.getByRole('link', { name: FACTORY_LINK.label })).toBeInTheDocument();
    });

    it('renders navigation with correct hrefs', () => {
      renderSidebar();
      for (const link of NAV_LINKS) {
        const anchor = screen.getByRole('link', { name: link.label });
        expect(anchor).toHaveAttribute('href', link.to);
      }
      const factoryLink = screen.getByRole('link', { name: FACTORY_LINK.label });
      expect(factoryLink).toHaveAttribute('href', FACTORY_LINK.to);
    });

    it('renders a separator before the Factory link', () => {
      renderSidebar();
      const nav = screen.getByRole('navigation', { name: 'Main navigation' });
      const separator = within(nav).getByRole('none');
      expect(separator).toBeInTheDocument();
      expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('renders the Smithy branding text when expanded', () => {
      renderSidebar();
      expect(screen.getByText('Smithy')).toBeInTheDocument();
    });

    it('renders main navigation aria label', () => {
      renderSidebar();
      expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    });
  });

  describe('active route highlighting', () => {
    it('highlights the Dashboard link when on /', () => {
      renderSidebar(['/']);
      const link = screen.getByRole('link', { name: 'Dashboard' });
      expect(link.className).toContain('bg-accent');
    });

    it('highlights Assembly Lines link when on /assembly-lines', () => {
      renderSidebar(['/assembly-lines']);
      const link = screen.getByRole('link', { name: 'Assembly Lines' });
      expect(link.className).toContain('bg-accent');
    });

    it('does not highlight Dashboard when on /assembly-lines', () => {
      renderSidebar(['/assembly-lines']);
      const link = screen.getByRole('link', { name: 'Dashboard' });
      // Check that the non-hover class list contains text-muted-foreground (inactive state)
      expect(link.className).toContain('text-muted-foreground');
      expect(link).not.toHaveAttribute('aria-current', 'page');
    });

    it('highlights Factory link when on /factory', () => {
      renderSidebar(['/factory']);
      const link = screen.getByRole('link', { name: 'Factory' });
      expect(link.className).toContain('bg-accent');
    });
  });

  describe('collapse toggle', () => {
    it('renders collapse button with correct initial label', () => {
      renderSidebar();
      expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
    });

    it('collapses sidebar on toggle click', async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

      expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    });

    it('hides link labels when collapsed', async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

      expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
      expect(screen.queryByText('Assembly Lines')).not.toBeInTheDocument();
    });

    it('hides Smithy branding when collapsed', async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

      expect(screen.queryByText('Smithy')).not.toBeInTheDocument();
    });

    it('persists collapse state to localStorage', async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

      expect(localStorage.getItem('smithy-sidebar-collapsed')).toBe('true');
    });

    it('restores collapse state from localStorage', () => {
      localStorage.setItem('smithy-sidebar-collapsed', 'true');
      renderSidebar();

      expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    });

    it('expands sidebar on second toggle', async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
      await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));

      expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('applies narrow width class when collapsed', async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

      const sidebar = screen.getByTestId('desktop-sidebar');
      expect(sidebar.className).toContain('w-14');
    });

    it('applies wide width class when expanded', () => {
      renderSidebar();
      const sidebar = screen.getByTestId('desktop-sidebar');
      expect(sidebar.className).toContain('w-56');
    });
  });

  describe('localStorage error handling', () => {
    it('handles localStorage.getItem throwing', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage error');
      });
      renderSidebar();
      // Should default to expanded (not collapsed)
      expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
      spy.mockRestore();
    });

    it('handles localStorage.setItem throwing', async () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage error');
      });
      const user = userEvent.setup();
      renderSidebar();

      // Should not throw, toggle still works in-memory
      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
      expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
      spy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — MobileSidebarTrigger
// ---------------------------------------------------------------------------

describe('MobileSidebarTrigger', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the hamburger button', () => {
    renderMobileTrigger();
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
  });

  it('opens the sheet when hamburger is clicked', async () => {
    const user = userEvent.setup();
    renderMobileTrigger();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));

    // Sheet content should render all nav links
    for (const link of NAV_LINKS) {
      expect(screen.getByRole('link', { name: link.label })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: FACTORY_LINK.label })).toBeInTheDocument();
  });

  it('shows Smithy branding in the sheet', async () => {
    const user = userEvent.setup();
    renderMobileTrigger();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));

    expect(screen.getByText('Smithy')).toBeInTheDocument();
  });

  it('renders a sr-only sheet title for accessibility', async () => {
    const user = userEvent.setup();
    renderMobileTrigger();

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));

    expect(screen.getByText('Navigation')).toBeInTheDocument();
  });
});
