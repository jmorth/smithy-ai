import {
  Factory,
  Users,
  Package,
  Container,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardStats } from '@/api/hooks/use-dashboard-stats';

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
}

function StatCard({ title, value, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-16 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

function StatsCardsError({ message }: { message: string }) {
  return (
    <div
      className="col-span-full rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center text-sm text-destructive"
      role="alert"
    >
      Failed to load dashboard stats: {message}
    </div>
  );
}

interface StatsCardsProps {
  data?: DashboardStats;
  isLoading: boolean;
  error: Error | null;
}

export function StatsCards({ data, isLoading, error }: StatsCardsProps) {
  if (error) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCardsError message={error.message} />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Active Assembly Lines"
        value={String(data.activeAssemblyLines)}
        icon={Factory}
      />
      <StatCard
        title="Active Worker Pools"
        value={String(data.activeWorkerPools)}
        icon={Users}
      />
      <StatCard
        title="In-Transit Packages"
        value={String(data.inTransitPackages)}
        icon={Package}
      />
      <StatCard
        title="Running Containers"
        value={`${data.runningContainers.used}/${data.runningContainers.max}`}
        icon={Container}
      />
    </div>
  );
}
