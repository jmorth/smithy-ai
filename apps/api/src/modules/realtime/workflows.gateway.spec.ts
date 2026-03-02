import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, NotFoundException } from '@nestjs/common';
import { WorkflowsGateway } from './workflows.gateway';
import type { SubscriptionResult } from './workflows.gateway';
import { REALTIME_NAMESPACE_WORKFLOWS } from './realtime.constants';
import { Socket } from 'socket.io';
import type { AssemblyLinesService } from '../workflows/assembly-lines/assembly-lines.service';
import type { WorkerPoolsService } from '../workflows/worker-pools/worker-pools.service';

function makeMockSocket(id = 'test-client-123'): Socket {
  return {
    id,
    join: vi.fn(),
    leave: vi.fn(),
  } as unknown as Socket;
}

function makeMockServer() {
  const emitFn = vi.fn();
  const toFn = vi.fn().mockReturnValue({ emit: emitFn });
  return { to: toFn, emit: emitFn, _roomEmit: emitFn, _toFn: toFn };
}

function makeMockAssemblyLinesService(): AssemblyLinesService {
  return {
    findBySlug: vi.fn().mockResolvedValue({ id: 1, slug: 'my-pipeline' }),
  } as unknown as AssemblyLinesService;
}

function makeMockWorkerPoolsService(): WorkerPoolsService {
  return {
    findBySlug: vi.fn().mockResolvedValue({ id: 1, slug: 'my-pool' }),
  } as unknown as WorkerPoolsService;
}

describe('WorkflowsGateway', () => {
  let gateway: WorkflowsGateway;
  let mockAssemblyLinesService: AssemblyLinesService;
  let mockWorkerPoolsService: WorkerPoolsService;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockAssemblyLinesService = makeMockAssemblyLinesService();
    mockWorkerPoolsService = makeMockWorkerPoolsService();
    gateway = new WorkflowsGateway(
      mockAssemblyLinesService,
      mockWorkerPoolsService,
    );
    debugSpy = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  // ── Decorator metadata ────────────────────────────────────────────────────

  describe('decorator metadata', () => {
    it('is configured with /workflows namespace', () => {
      const metadata = Reflect.getMetadata(
        'websockets:is_gateway',
        WorkflowsGateway,
      );
      expect(metadata).toBe(true);

      const gatewayOptions = Reflect.getMetadata(
        'websockets:gateway_options',
        WorkflowsGateway,
      );
      expect(gatewayOptions).toBeDefined();
      expect(gatewayOptions.namespace).toBe(REALTIME_NAMESPACE_WORKFLOWS);
    });

    it('has CORS configuration', () => {
      const gatewayOptions = Reflect.getMetadata(
        'websockets:gateway_options',
        WorkflowsGateway,
      );
      expect(gatewayOptions.cors).toBeDefined();
      expect(gatewayOptions.cors.credentials).toBe(true);
      expect(gatewayOptions.cors.origin).toBeDefined();
    });
  });

  // ── handleConnection ──────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('logs client connection at debug level', () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      expect(debugSpy).toHaveBeenCalledWith(
        'Client connected: test-client-123',
      );
    });

    it('initializes client subscription tracking', () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const subs = gateway.getClientSubscriptions();
      expect(subs.get('test-client-123')).toBeDefined();
      expect(subs.get('test-client-123')!.size).toBe(0);
    });
  });

  // ── handleDisconnect ──────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('logs client disconnection with rooms', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeAssemblyLine(client, 'my-pipeline');

      gateway.handleDisconnect(client);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Client disconnected: test-client-123'),
      );
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('assembly-line:my-pipeline'),
      );
    });

    it('logs "none" when client has no rooms', () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      gateway.handleDisconnect(client);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('rooms: none'),
      );
    });

    it('removes client from subscription tracking', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeAssemblyLine(client, 'my-pipeline');

      gateway.handleDisconnect(client);

      expect(gateway.getClientSubscriptions().has('test-client-123')).toBe(
        false,
      );
    });

    it('handles disconnect for unknown client gracefully', () => {
      const client = makeMockSocket('unknown-client');
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });
  });

  // ── subscribe:assembly-line ───────────────────────────────────────────────

  describe('handleSubscribeAssemblyLine', () => {
    it('joins the assembly-line room on valid slug', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeAssemblyLine(
        client,
        'my-pipeline',
      );

      expect(result).toEqual({
        success: true,
        room: 'assembly-line:my-pipeline',
      });
      expect(client.join).toHaveBeenCalledWith('assembly-line:my-pipeline');
    });

    it('validates slug existence via AssemblyLinesService', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      await gateway.handleSubscribeAssemblyLine(client, 'my-pipeline');

      expect(mockAssemblyLinesService.findBySlug).toHaveBeenCalledWith(
        'my-pipeline',
      );
    });

    it('returns error when assembly line does not exist', async () => {
      vi.mocked(mockAssemblyLinesService.findBySlug).mockRejectedValue(
        new NotFoundException('not found'),
      );
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeAssemblyLine(
        client,
        'nonexistent',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(client.join).not.toHaveBeenCalled();
    });

    it('tracks subscription in clientSubscriptions map', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      await gateway.handleSubscribeAssemblyLine(client, 'my-pipeline');

      const subs = gateway.getClientSubscriptions().get('test-client-123');
      expect(subs).toBeDefined();
      expect(subs!.has('assembly-line:my-pipeline')).toBe(true);
    });

    it('rejects empty slug', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeAssemblyLine(client, '');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid slug');
    });

    it('rejects slug with invalid characters', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeAssemblyLine(
        client,
        'My Pipeline!',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid slug');
    });

    it('rejects slug with leading hyphen', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeAssemblyLine(
        client,
        '-leading',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid slug');
    });

    it('rejects slug with trailing hyphen', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeAssemblyLine(
        client,
        'trailing-',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid slug');
    });

    it('rejects slug with consecutive hyphens', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeAssemblyLine(
        client,
        'double--hyphen',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid slug');
    });

    it('tracks subscription even without prior handleConnection', async () => {
      const client = makeMockSocket('no-connect-client');

      const result = await gateway.handleSubscribeAssemblyLine(
        client,
        'my-pipeline',
      );

      expect(result.success).toBe(true);
      const subs = gateway.getClientSubscriptions().get('no-connect-client');
      expect(subs).toBeDefined();
      expect(subs!.has('assembly-line:my-pipeline')).toBe(true);
    });

    it('accepts valid multi-segment slug', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeAssemblyLine(
        client,
        'my-cool-pipeline',
      );

      expect(result.success).toBe(true);
    });

    it('rejects non-string slug', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeAssemblyLine(
        client,
        123 as unknown as string,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid slug');
    });
  });

  // ── subscribe:worker-pool ─────────────────────────────────────────────────

  describe('handleSubscribeWorkerPool', () => {
    it('joins the worker-pool room on valid slug', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeWorkerPool(
        client,
        'my-pool',
      );

      expect(result).toEqual({
        success: true,
        room: 'worker-pool:my-pool',
      });
      expect(client.join).toHaveBeenCalledWith('worker-pool:my-pool');
    });

    it('validates slug existence via WorkerPoolsService', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      await gateway.handleSubscribeWorkerPool(client, 'my-pool');

      expect(mockWorkerPoolsService.findBySlug).toHaveBeenCalledWith(
        'my-pool',
      );
    });

    it('returns error when worker pool does not exist', async () => {
      vi.mocked(mockWorkerPoolsService.findBySlug).mockRejectedValue(
        new NotFoundException('not found'),
      );
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeWorkerPool(
        client,
        'nonexistent',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonexistent');
      expect(client.join).not.toHaveBeenCalled();
    });

    it('tracks subscription in clientSubscriptions map', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      await gateway.handleSubscribeWorkerPool(client, 'my-pool');

      const subs = gateway.getClientSubscriptions().get('test-client-123');
      expect(subs!.has('worker-pool:my-pool')).toBe(true);
    });

    it('rejects invalid slug', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = await gateway.handleSubscribeWorkerPool(
        client,
        'INVALID!!',
      );

      expect(result.success).toBe(false);
    });
  });

  // ── unsubscribe:assembly-line ─────────────────────────────────────────────

  describe('handleUnsubscribeAssemblyLine', () => {
    it('leaves the assembly-line room', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeAssemblyLine(client, 'my-pipeline');

      const result = gateway.handleUnsubscribeAssemblyLine(
        client,
        'my-pipeline',
      );

      expect(result).toEqual({
        success: true,
        room: 'assembly-line:my-pipeline',
      });
      expect(client.leave).toHaveBeenCalledWith('assembly-line:my-pipeline');
    });

    it('removes room from client subscription tracking', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeAssemblyLine(client, 'my-pipeline');

      gateway.handleUnsubscribeAssemblyLine(client, 'my-pipeline');

      const subs = gateway.getClientSubscriptions().get('test-client-123');
      expect(subs!.has('assembly-line:my-pipeline')).toBe(false);
    });

    it('rejects invalid slug', () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = gateway.handleUnsubscribeAssemblyLine(client, '');

      expect(result.success).toBe(false);
    });

    it('handles unsubscribe for unknown client gracefully', () => {
      const client = makeMockSocket('unknown');

      const result = gateway.handleUnsubscribeAssemblyLine(
        client,
        'my-pipeline',
      );

      expect(result.success).toBe(true);
      expect(client.leave).toHaveBeenCalled();
    });
  });

  // ── unsubscribe:worker-pool ───────────────────────────────────────────────

  describe('handleUnsubscribeWorkerPool', () => {
    it('leaves the worker-pool room', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeWorkerPool(client, 'my-pool');

      const result = gateway.handleUnsubscribeWorkerPool(client, 'my-pool');

      expect(result).toEqual({
        success: true,
        room: 'worker-pool:my-pool',
      });
      expect(client.leave).toHaveBeenCalledWith('worker-pool:my-pool');
    });

    it('removes room from client subscription tracking', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeWorkerPool(client, 'my-pool');

      gateway.handleUnsubscribeWorkerPool(client, 'my-pool');

      const subs = gateway.getClientSubscriptions().get('test-client-123');
      expect(subs!.has('worker-pool:my-pool')).toBe(false);
    });

    it('rejects invalid slug', () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const result = gateway.handleUnsubscribeWorkerPool(client, '');

      expect(result.success).toBe(false);
    });
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('rejects subscription when client exceeds 50 rooms', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      // Fill up to 50 rooms by directly manipulating tracking
      const subs = gateway.getClientSubscriptions().get(
        'test-client-123',
      ) as Set<string>;
      for (let i = 0; i < 50; i++) {
        subs.add(`assembly-line:pipeline-${i}`);
      }

      const result = await gateway.handleSubscribeAssemblyLine(
        client,
        'one-too-many',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum room limit');
      expect(result.error).toContain('50');
    });

    it('allows subscription at exactly 49 rooms', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const subs = gateway.getClientSubscriptions().get(
        'test-client-123',
      ) as Set<string>;
      for (let i = 0; i < 49; i++) {
        subs.add(`assembly-line:pipeline-${i}`);
      }

      const result = await gateway.handleSubscribeAssemblyLine(
        client,
        'just-under-limit',
      );

      expect(result.success).toBe(true);
    });

    it('rate limits worker pool subscriptions too', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);

      const subs = gateway.getClientSubscriptions().get(
        'test-client-123',
      ) as Set<string>;
      for (let i = 0; i < 50; i++) {
        subs.add(`worker-pool:pool-${i}`);
      }

      const result = await gateway.handleSubscribeWorkerPool(
        client,
        'one-too-many',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum room limit');
    });
  });

  // ── Broadcast methods ─────────────────────────────────────────────────────

  describe('emitToRoom', () => {
    it('emits event to specified room', () => {
      const mock = makeMockServer();
      gateway.server = mock as unknown as WorkflowsGateway['server'];

      gateway.emitToRoom('assembly-line:test', 'package:status', {
        id: 1,
      });

      expect(mock._toFn).toHaveBeenCalledWith('assembly-line:test');
      expect(mock._roomEmit).toHaveBeenCalledWith('package:status', {
        id: 1,
      });
    });
  });

  describe('emitToAll', () => {
    it('emits event to all connected clients', () => {
      const mock = makeMockServer();
      gateway.server = mock as unknown as WorkflowsGateway['server'];

      gateway.emitToAll('system:announcement', { message: 'hello' });

      expect(mock.emit).toHaveBeenCalledWith('system:announcement', {
        message: 'hello',
      });
    });
  });

  describe('broadcastPackageStatus', () => {
    it('emits package:status to assembly line room', () => {
      const mock = makeMockServer();
      gateway.server = mock as unknown as WorkflowsGateway['server'];
      const data = { packageId: 1, status: 'processing' };

      gateway.broadcastPackageStatus('my-pipeline', data);

      expect(mock._toFn).toHaveBeenCalledWith('assembly-line:my-pipeline');
      expect(mock._roomEmit).toHaveBeenCalledWith('package:status', data);
    });
  });

  describe('broadcastJobState', () => {
    it('emits job:state to assembly line room', () => {
      const mock = makeMockServer();
      gateway.server = mock as unknown as WorkflowsGateway['server'];
      const data = { jobId: 1, state: 'running' };

      gateway.broadcastJobState('my-pipeline', null, data);

      expect(mock._toFn).toHaveBeenCalledWith('assembly-line:my-pipeline');
      expect(mock._roomEmit).toHaveBeenCalledWith('job:state', data);
    });

    it('emits job:state to both assembly line and worker pool rooms', () => {
      const mock = makeMockServer();
      gateway.server = mock as unknown as WorkflowsGateway['server'];
      const data = { jobId: 1, state: 'running' };

      gateway.broadcastJobState('my-pipeline', 'my-pool', data);

      expect(mock._toFn).toHaveBeenCalledWith('assembly-line:my-pipeline');
      expect(mock._toFn).toHaveBeenCalledWith('worker-pool:my-pool');
      expect(mock._roomEmit).toHaveBeenCalledTimes(2);
    });

    it('does not emit to worker pool room when slug is null', () => {
      const mock = makeMockServer();
      gateway.server = mock as unknown as WorkflowsGateway['server'];
      const data = { jobId: 1, state: 'running' };

      gateway.broadcastJobState('my-pipeline', null, data);

      expect(mock._toFn).toHaveBeenCalledTimes(1);
      expect(mock._toFn).toHaveBeenCalledWith('assembly-line:my-pipeline');
    });
  });

  describe('broadcastAssemblyLineProgress', () => {
    it('emits assembly-line:progress to assembly line room', () => {
      const mock = makeMockServer();
      gateway.server = mock as unknown as WorkflowsGateway['server'];
      const data = { completedSteps: 3, totalSteps: 5 };

      gateway.broadcastAssemblyLineProgress('my-pipeline', data);

      expect(mock._toFn).toHaveBeenCalledWith('assembly-line:my-pipeline');
      expect(mock._roomEmit).toHaveBeenCalledWith(
        'assembly-line:progress',
        data,
      );
    });
  });

  describe('broadcastAssemblyLineCompleted', () => {
    it('emits assembly-line:completed to assembly line room', () => {
      const mock = makeMockServer();
      gateway.server = mock as unknown as WorkflowsGateway['server'];
      const data = { slug: 'my-pipeline', finishedAt: '2026-03-02' };

      gateway.broadcastAssemblyLineCompleted('my-pipeline', data);

      expect(mock._toFn).toHaveBeenCalledWith('assembly-line:my-pipeline');
      expect(mock._roomEmit).toHaveBeenCalledWith(
        'assembly-line:completed',
        data,
      );
    });
  });

  // ── getClientSubscriptions ────────────────────────────────────────────────

  describe('getClientSubscriptions', () => {
    it('returns the client subscriptions map', () => {
      const subs = gateway.getClientSubscriptions();
      expect(subs).toBeInstanceOf(Map);
    });

    it('reflects subscriptions after joins', async () => {
      const client = makeMockSocket();
      gateway.handleConnection(client);
      await gateway.handleSubscribeAssemblyLine(client, 'my-pipeline');
      await gateway.handleSubscribeWorkerPool(client, 'my-pool');

      const subs = gateway.getClientSubscriptions().get('test-client-123');
      expect(subs!.size).toBe(2);
      expect(subs!.has('assembly-line:my-pipeline')).toBe(true);
      expect(subs!.has('worker-pool:my-pool')).toBe(true);
    });
  });

  // ── SubscribeMessage metadata ─────────────────────────────────────────────

  describe('SubscribeMessage metadata', () => {
    it('registers subscribe:assembly-line handler', () => {
      const metadata = Reflect.getMetadata(
        'message',
        WorkflowsGateway.prototype.handleSubscribeAssemblyLine,
      );
      expect(metadata).toBe('subscribe:assembly-line');
    });

    it('registers subscribe:worker-pool handler', () => {
      const metadata = Reflect.getMetadata(
        'message',
        WorkflowsGateway.prototype.handleSubscribeWorkerPool,
      );
      expect(metadata).toBe('subscribe:worker-pool');
    });

    it('registers unsubscribe:assembly-line handler', () => {
      const metadata = Reflect.getMetadata(
        'message',
        WorkflowsGateway.prototype.handleUnsubscribeAssemblyLine,
      );
      expect(metadata).toBe('unsubscribe:assembly-line');
    });

    it('registers unsubscribe:worker-pool handler', () => {
      const metadata = Reflect.getMetadata(
        'message',
        WorkflowsGateway.prototype.handleUnsubscribeWorkerPool,
      );
      expect(metadata).toBe('unsubscribe:worker-pool');
    });
  });
});
