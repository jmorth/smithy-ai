import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { socketManager } from '@/api/socket';
import type { SmithyEvent } from '@smithy/shared';
import { RoutingKeys } from '@smithy/shared';

const MAX_EVENTS = 20;

export type EventSeverity = 'success' | 'warning' | 'error' | 'info';

export interface ActivityEvent {
  id: string;
  timestamp: string;
  eventType: string;
  description: string;
  severity: EventSeverity;
}

const SEVERITY_COLORS: Record<EventSeverity, string> = {
  success: 'bg-green-500/15 text-green-700 border-green-500/30',
  warning: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30',
  error: 'bg-red-500/15 text-red-700 border-red-500/30',
  info: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
};

function classifyEvent(eventType: string): {
  severity: EventSeverity;
  label: string;
} {
  switch (eventType) {
    case RoutingKeys.PACKAGE_CREATED:
      return { severity: 'info', label: 'Package Created' };
    case RoutingKeys.PACKAGE_PROCESSED:
      return { severity: 'success', label: 'Package Processed' };
    case RoutingKeys.JOB_STARTED:
      return { severity: 'info', label: 'Job Started' };
    case RoutingKeys.JOB_COMPLETED:
      return { severity: 'success', label: 'Job Completed' };
    case RoutingKeys.JOB_STUCK:
      return { severity: 'warning', label: 'Job Stuck' };
    case RoutingKeys.JOB_ERROR:
      return { severity: 'error', label: 'Job Error' };
    case RoutingKeys.JOB_STATE_CHANGED:
      return { severity: 'info', label: 'State Changed' };
    case RoutingKeys.ASSEMBLY_LINE_COMPLETED:
      return { severity: 'success', label: 'Line Completed' };
    case RoutingKeys.ASSEMBLY_LINE_STEP_COMPLETED:
      return { severity: 'success', label: 'Step Completed' };
    default:
      return { severity: 'info', label: eventType };
  }
}

function describeEvent(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case RoutingKeys.PACKAGE_CREATED:
      return `Package ${payload.packageId ?? 'unknown'} created (type: ${payload.type ?? 'unknown'})`;
    case RoutingKeys.PACKAGE_PROCESSED:
      return `Package ${payload.packageId ?? 'unknown'} processed — ${payload.resultSummary ?? 'completed'}`;
    case RoutingKeys.JOB_STARTED:
      return `Job ${payload.jobExecutionId ?? 'unknown'} started for package ${payload.packageId ?? 'unknown'}`;
    case RoutingKeys.JOB_COMPLETED:
      return `Job ${payload.jobExecutionId ?? 'unknown'} completed in ${payload.duration ?? '?'}ms`;
    case RoutingKeys.JOB_STUCK:
      return `Job ${payload.jobExecutionId ?? 'unknown'} is stuck: ${payload.reason ?? 'unknown reason'}`;
    case RoutingKeys.JOB_ERROR:
      return `Job ${payload.jobExecutionId ?? 'unknown'} error: ${(payload.error as Record<string, unknown>)?.message ?? 'unknown'}`;
    case RoutingKeys.JOB_STATE_CHANGED:
      return `Job ${payload.jobExecutionId ?? 'unknown'}: ${payload.previousState ?? '?'} → ${payload.newState ?? '?'}`;
    case RoutingKeys.ASSEMBLY_LINE_COMPLETED:
      return `Assembly line ${payload.assemblyLineId ?? 'unknown'} completed (${payload.totalSteps ?? '?'} steps)`;
    case RoutingKeys.ASSEMBLY_LINE_STEP_COMPLETED:
      return `Step ${payload.stepIndex ?? '?'} "${payload.stepName ?? ''}" completed in ${payload.duration ?? '?'}ms`;
    default:
      return `Event: ${eventType}`;
  }
}

function toActivityEvent(event: SmithyEvent): ActivityEvent {
  const { severity, label } = classifyEvent(event.eventType);
  const payload = event.payload as Record<string, unknown>;
  return {
    id: `${event.correlationId}-${event.timestamp}`,
    timestamp: event.timestamp,
    eventType: label,
    description: describeEvent(event.eventType, payload),
    severity,
  };
}

export function useActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  const addEvent = useCallback((event: SmithyEvent) => {
    const activityEvent = toActivityEvent(event);
    setEvents((prev) => [activityEvent, ...prev].slice(0, MAX_EVENTS));
  }, []);

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    try {
      const workflowKeys = [
        RoutingKeys.PACKAGE_CREATED,
        RoutingKeys.PACKAGE_PROCESSED,
        RoutingKeys.JOB_STATE_CHANGED,
        RoutingKeys.ASSEMBLY_LINE_COMPLETED,
        RoutingKeys.ASSEMBLY_LINE_STEP_COMPLETED,
      ] as const;

      for (const key of workflowKeys) {
        unsubscribers.push(
          socketManager.onEvent('/workflows', key, addEvent),
        );
      }

      const jobKeys = [
        RoutingKeys.JOB_STARTED,
        RoutingKeys.JOB_COMPLETED,
        RoutingKeys.JOB_STUCK,
        RoutingKeys.JOB_ERROR,
      ] as const;

      for (const key of jobKeys) {
        unsubscribers.push(
          socketManager.onEvent('/jobs', key, addEvent),
        );
      }
    } catch {
      // Socket not connected yet — events will be missed until reconnect
    }

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [addEvent]);

  return events;
}

interface ActivityFeedProps {
  events: ActivityEvent[];
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Activity Feed</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No recent activity. Events will appear here in real-time.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 text-sm"
              >
                <span className="shrink-0 text-xs text-muted-foreground min-w-[5rem] pt-0.5">
                  {formatDistanceToNow(new Date(event.timestamp), {
                    addSuffix: true,
                  })}
                </span>
                <Badge
                  className={cn(
                    'shrink-0',
                    SEVERITY_COLORS[event.severity],
                  )}
                >
                  {event.eventType}
                </Badge>
                <span className="text-foreground">{event.description}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
