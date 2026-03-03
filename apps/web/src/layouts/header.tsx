import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useViewMode,
  useSocketState,
  useUnreadNotificationCount,
  useAppStore,
} from '@/stores/app.store';
import type { SocketState } from '@/stores/app.store';
import { MobileSidebarTrigger } from './sidebar';

const SOCKET_INDICATOR: Record<SocketState, { color: string; label: string }> = {
  connected: { color: 'bg-green-500', label: 'Connected' },
  reconnecting: { color: 'bg-yellow-500', label: 'Reconnecting' },
  disconnected: { color: 'bg-red-500', label: 'Disconnected' },
};

export function Header() {
  const navigate = useNavigate();
  const viewMode = useViewMode();
  const socketState = useSocketState();
  const unreadCount = useUnreadNotificationCount();
  const setViewMode = useAppStore((s) => s.setViewMode);

  const indicator = SOCKET_INDICATOR[socketState];

  const handleViewModeToggle = () => {
    if (viewMode === 'managerial') {
      setViewMode('factory');
      navigate('/factory');
    } else {
      setViewMode('managerial');
      navigate('/');
    }
  };

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4">
      <MobileSidebarTrigger />

      <h1 className="text-lg font-semibold md:hidden">Smithy</h1>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2" aria-label={`Socket status: ${indicator.label}`}>
          <span
            data-testid="socket-indicator"
            className={cn('h-2 w-2 rounded-full', indicator.color)}
          />
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {indicator.label}
          </span>
        </div>

        <div className="relative">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </Button>
          {unreadCount > 0 && (
            <Badge
              data-testid="notification-badge"
              className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px] leading-none"
            >
              {unreadCount}
            </Badge>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleViewModeToggle}
          aria-label={`Switch to ${viewMode === 'managerial' ? 'Factory' : 'Dashboard'} view`}
        >
          {viewMode === 'managerial' ? 'Factory' : 'Dashboard'}
        </Button>
      </div>
    </header>
  );
}
