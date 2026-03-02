import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AssemblyLinesService } from '../workflows/assembly-lines/assembly-lines.service';
import { WorkerPoolsService } from '../workflows/worker-pools/worker-pools.service';
import { REALTIME_NAMESPACE_WORKFLOWS } from './realtime.constants';

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ROOMS_PER_CLIENT = 50;

export interface SubscriptionResult {
  success: boolean;
  room?: string;
  error?: string;
}

@WebSocketGateway({
  namespace: REALTIME_NAMESPACE_WORKFLOWS,
  cors: {
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    credentials: true,
  },
})
export class WorkflowsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WorkflowsGateway.name);
  private readonly clientSubscriptions = new Map<string, Set<string>>();

  constructor(
    private readonly assemblyLinesService: AssemblyLinesService,
    private readonly workerPoolsService: WorkerPoolsService,
  ) {}

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
    this.clientSubscriptions.set(client.id, new Set());
  }

  handleDisconnect(client: Socket): void {
    const rooms = this.clientSubscriptions.get(client.id);
    const roomList = rooms && rooms.size > 0 ? [...rooms].join(', ') : 'none';
    this.logger.debug(
      `Client disconnected: ${client.id}, rooms: ${roomList}`,
    );
    this.clientSubscriptions.delete(client.id);
  }

  @SubscribeMessage('subscribe:assembly-line')
  async handleSubscribeAssemblyLine(
    client: Socket,
    slug: string,
  ): Promise<SubscriptionResult> {
    const validation = this.validateSlug(slug);
    if (validation) return validation;

    const rateLimitError = this.checkRateLimit(client.id);
    if (rateLimitError) return rateLimitError;

    try {
      await this.assemblyLinesService.findBySlug(slug);
    } catch {
      return { success: false, error: `Assembly line "${slug}" not found` };
    }

    const room = `assembly-line:${slug}`;
    client.join(room);
    this.trackSubscription(client.id, room);

    return { success: true, room };
  }

  @SubscribeMessage('subscribe:worker-pool')
  async handleSubscribeWorkerPool(
    client: Socket,
    slug: string,
  ): Promise<SubscriptionResult> {
    const validation = this.validateSlug(slug);
    if (validation) return validation;

    const rateLimitError = this.checkRateLimit(client.id);
    if (rateLimitError) return rateLimitError;

    try {
      await this.workerPoolsService.findBySlug(slug);
    } catch {
      return { success: false, error: `Worker pool "${slug}" not found` };
    }

    const room = `worker-pool:${slug}`;
    client.join(room);
    this.trackSubscription(client.id, room);

    return { success: true, room };
  }

  @SubscribeMessage('unsubscribe:assembly-line')
  handleUnsubscribeAssemblyLine(
    client: Socket,
    slug: string,
  ): SubscriptionResult {
    const validation = this.validateSlug(slug);
    if (validation) return validation;

    const room = `assembly-line:${slug}`;
    client.leave(room);
    this.untrackSubscription(client.id, room);

    return { success: true, room };
  }

  @SubscribeMessage('unsubscribe:worker-pool')
  handleUnsubscribeWorkerPool(
    client: Socket,
    slug: string,
  ): SubscriptionResult {
    const validation = this.validateSlug(slug);
    if (validation) return validation;

    const room = `worker-pool:${slug}`;
    client.leave(room);
    this.untrackSubscription(client.id, room);

    return { success: true, room };
  }

  // ── Broadcast methods (called by bridge service, task 074) ──────────────────

  emitToRoom(room: string, event: string, data: unknown): void {
    this.server.to(room).emit(event, data);
  }

  emitToAll(event: string, data: unknown): void {
    this.server.emit(event, data);
  }

  broadcastPackageStatus(
    assemblyLineSlug: string,
    data: unknown,
  ): void {
    this.emitToRoom(`assembly-line:${assemblyLineSlug}`, 'package:status', data);
  }

  broadcastJobState(
    assemblyLineSlug: string,
    workerPoolSlug: string | null,
    data: unknown,
  ): void {
    this.emitToRoom(`assembly-line:${assemblyLineSlug}`, 'job:state', data);
    if (workerPoolSlug) {
      this.emitToRoom(`worker-pool:${workerPoolSlug}`, 'job:state', data);
    }
  }

  broadcastAssemblyLineProgress(
    assemblyLineSlug: string,
    data: unknown,
  ): void {
    this.emitToRoom(
      `assembly-line:${assemblyLineSlug}`,
      'assembly-line:progress',
      data,
    );
  }

  broadcastAssemblyLineCompleted(
    assemblyLineSlug: string,
    data: unknown,
  ): void {
    this.emitToRoom(
      `assembly-line:${assemblyLineSlug}`,
      'assembly-line:completed',
      data,
    );
  }

  // ── Admin visibility ────────────────────────────────────────────────────────

  getClientSubscriptions(): ReadonlyMap<string, ReadonlySet<string>> {
    return this.clientSubscriptions;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private validateSlug(slug: string): SubscriptionResult | null {
    if (!slug || typeof slug !== 'string' || !SLUG_REGEX.test(slug)) {
      return {
        success: false,
        error: `Invalid slug "${slug}". Slugs must be non-empty, alphanumeric with hyphens.`,
      };
    }
    return null;
  }

  private checkRateLimit(clientId: string): SubscriptionResult | null {
    const rooms = this.clientSubscriptions.get(clientId);
    if (rooms && rooms.size >= MAX_ROOMS_PER_CLIENT) {
      return {
        success: false,
        error: `Maximum room limit (${MAX_ROOMS_PER_CLIENT}) reached`,
      };
    }
    return null;
  }

  private trackSubscription(clientId: string, room: string): void {
    let rooms = this.clientSubscriptions.get(clientId);
    if (!rooms) {
      rooms = new Set();
      this.clientSubscriptions.set(clientId, rooms);
    }
    rooms.add(room);
  }

  private untrackSubscription(clientId: string, room: string): void {
    const rooms = this.clientSubscriptions.get(clientId);
    if (rooms) {
      rooms.delete(room);
    }
  }
}
