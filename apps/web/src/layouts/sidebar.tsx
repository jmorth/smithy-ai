import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  GitBranch,
  Users,
  Package,
  Cpu,
  FileText,
  Factory,
  PanelLeftClose,
  PanelLeft,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/assembly-lines', label: 'Assembly Lines', icon: GitBranch },
  { to: '/worker-pools', label: 'Worker Pools', icon: Users },
  { to: '/packages', label: 'Packages', icon: Package },
  { to: '/workers', label: 'Workers', icon: Cpu },
  { to: '/logs', label: 'Logs', icon: FileText },
] as const;

const FACTORY_LINK = { to: '/factory', label: 'Factory', icon: Factory } as const;

function getStoredCollapsed(): boolean {
  try {
    const stored = localStorage.getItem('smithy-sidebar-collapsed');
    return stored === 'true';
  } catch {
    return false;
  }
}

interface SidebarNavProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

function SidebarNav({ collapsed, onNavigate }: SidebarNavProps) {
  return (
    <nav className="flex flex-col gap-1 px-2" aria-label="Main navigation">
      {NAV_LINKS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground',
              collapsed && 'justify-center px-2',
            )
          }
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{label}</span>}
        </NavLink>
      ))}
      <Separator className="my-2" />
      <NavLink
        to={FACTORY_LINK.to}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            isActive
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground',
            collapsed && 'justify-center px-2',
          )
        }
      >
        <Factory className="h-4 w-4 shrink-0 text-amber-500" />
        {!collapsed && <span>{FACTORY_LINK.label}</span>}
      </NavLink>
    </nav>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(getStoredCollapsed);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('smithy-sidebar-collapsed', String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  return (
    <aside
      data-testid="desktop-sidebar"
      className={cn(
        'hidden md:flex flex-col border-r bg-background transition-all duration-200',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center border-b px-3',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        {!collapsed && (
          <span className="text-lg font-semibold">Smithy</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="h-8 w-8"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <SidebarNav collapsed={collapsed} />
      </div>
    </aside>
  );
}

export function MobileSidebarTrigger() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden h-8 w-8"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b px-4">
            <span className="text-lg font-semibold">Smithy</span>
          </div>
          <div className="py-2">
            <SidebarNav collapsed={false} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export { NAV_LINKS, FACTORY_LINK };
