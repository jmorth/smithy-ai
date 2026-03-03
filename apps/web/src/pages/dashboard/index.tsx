import { useNavigate } from 'react-router-dom';
import { Plus, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboardStats } from '@/api/hooks/use-dashboard-stats';
import { StatsCards } from './components/stats-cards';
import { ActivityFeed, useActivityFeed } from './components/activity-feed';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useDashboardStats();
  const events = useActivityFeed();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">
          System Overview
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/packages')}
          >
            <Package className="mr-2 h-4 w-4" />
            Submit Package
          </Button>
          <Button onClick={() => navigate('/assembly-lines/create')}>
            <Plus className="mr-2 h-4 w-4" />
            Create Assembly Line
          </Button>
        </div>
      </div>

      <StatsCards data={data} isLoading={isLoading} error={error} />

      <ActivityFeed events={events} />
    </div>
  );
}
