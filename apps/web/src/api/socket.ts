import { Manager, type Socket } from 'socket.io-client';
import type {
  EventTypeMap,
  SmithyEvent,
  PackageCreatedEvent,
  PackageProcessedEvent,
  WorkerStateChangedEvent,
  JobStartedEvent,
  JobCompletedEvent,
  JobStuckEvent,
  JobErrorEvent,
  AssemblyLineCompletedEvent,
  AssemblyLineStepCompletedEvent,
} from '@smithy/shared';
import { RoutingKeys } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export type StateChangeCallback = (state: ConnectionState) => void;

// ---------------------------------------------------------------------------
// Namespace definitions
// ---------------------------------------------------------------------------

export type SocketNamespace = '/workflows' | '/jobs' | '/interactive';

// ---------------------------------------------------------------------------
// Typed event maps per namespace
// ---------------------------------------------------------------------------

export interface WorkflowEvents {
  [RoutingKeys.PACKAGE_CREATED]: PackageCreatedEvent;
  [RoutingKeys.PACKAGE_PROCESSED]: PackageProcessedEvent;
  [RoutingKeys.JOB_STATE_CHANGED]: WorkerStateChangedEvent;
  [RoutingKeys.ASSEMBLY_LINE_COMPLETED]: AssemblyLineCompletedEvent;
  [RoutingKeys.ASSEMBLY_LINE_STEP_COMPLETED]: AssemblyLineStepCompletedEvent;
}

export interface JobEvents {
  [RoutingKeys.JOB_STARTED]: JobStartedEvent;
  [RoutingKeys.JOB_COMPLETED]: JobCompletedEvent;
  [RoutingKeys.JOB_STUCK]: JobStuckEvent;
  [RoutingKeys.JOB_ERROR]: JobErrorEvent;
  [RoutingKeys.JOB_STATE_CHANGED]: WorkerStateChangedEvent;
}

export interface InteractiveEvents {
  'question': SmithyEvent<{
    jobId: string;
    questionId: string;
    prompt: string;
    options?: string[];
  }>;
}

export interface NamespaceEventMap {
  '/workflows': WorkflowEvents;
  '/jobs': JobEvents;
  '/interactive': InteractiveEvents;
}

// ---------------------------------------------------------------------------
// SocketManager
// ---------------------------------------------------------------------------

export class SocketManager {
  private manager: Manager | null = null;
  private sockets = new Map<SocketNamespace, Socket>();
  private subscriptions = new Map<SocketNamespace, Set<string>>();
  private state: ConnectionState = 'disconnected';
  private stateCallbacks = new Set<StateChangeCallback>();
  private readonly url: string;

  constructor(url?: string) {
    this.url = url ?? this.resolveUrl();
  }

  private resolveUrl(): string {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
      const apiUrl = import.meta.env.VITE_API_URL as string;
      try {
        const parsed = new URL(apiUrl);
        return parsed.origin;
      } catch {
        // Relative path like /api — use current origin
        return typeof window !== 'undefined'
          ? window.location.origin
          : 'http://localhost:3000';
      }
    }
    return typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000';
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  connect(): void {
    if (this.manager) return;

    this.manager = new Manager(this.url, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0,
      reconnectionAttempts: Infinity,
    });

    // The Manager itself does not connect until a namespace socket opens.
    // We bind state tracking to the manager's engine events once open.
    this.manager.on('open', () => {
      this.setState('connected');
    });

    this.manager.on('close', (reason: string) => {
      // If we still have the manager, we're going to reconnect
      if (this.manager) {
        this.setState('reconnecting');
      } else {
        this.setState('disconnected');
      }
    });

    this.manager.on('reconnect_attempt', () => {
      this.setState('reconnecting');
    });

    this.manager.on('reconnect', () => {
      this.setState('connected');
    });

    this.manager.on('error', () => {
      if (this.state !== 'reconnecting') {
        this.setState('reconnecting');
      }
    });
  }

  disconnect(): void {
    if (!this.manager) return;

    // Disconnect all namespace sockets
    for (const [ns, socket] of this.sockets) {
      socket.disconnect();
    }
    this.sockets.clear();
    this.subscriptions.clear();

    this.manager.engine?.close();
    this.manager = null;
    this.setState('disconnected');
  }

  // -------------------------------------------------------------------------
  // Connection state
  // -------------------------------------------------------------------------

  getState(): ConnectionState {
    return this.state;
  }

  onStateChange(callback: StateChangeCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => {
      this.stateCallbacks.delete(callback);
    };
  }

  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const cb of this.stateCallbacks) {
      cb(newState);
    }
  }

  // -------------------------------------------------------------------------
  // Namespace management (lazy creation / cleanup)
  // -------------------------------------------------------------------------

  private getOrCreateSocket(namespace: SocketNamespace): Socket {
    let socket = this.sockets.get(namespace);
    if (socket) return socket;

    if (!this.manager) {
      throw new Error(
        'SocketManager not connected. Call connect() before subscribing.',
      );
    }

    socket = this.manager.socket(namespace);
    this.sockets.set(namespace, socket);
    this.subscriptions.set(namespace, new Set());
    socket.connect();

    return socket;
  }

  private cleanupNamespace(namespace: SocketNamespace): void {
    const rooms = this.subscriptions.get(namespace);
    if (rooms && rooms.size > 0) return;

    const socket = this.sockets.get(namespace);
    if (socket) {
      socket.disconnect();
      this.sockets.delete(namespace);
    }
    this.subscriptions.delete(namespace);
  }

  // -------------------------------------------------------------------------
  // Room subscriptions
  // -------------------------------------------------------------------------

  subscribeAssemblyLine(slug: string): void {
    const room = `assembly-line:${slug}`;
    const socket = this.getOrCreateSocket('/workflows');
    const rooms = this.subscriptions.get('/workflows')!;
    if (!rooms.has(room)) {
      rooms.add(room);
      socket.emit('join', { room });
    }
  }

  subscribeWorkerPool(slug: string): void {
    const room = `worker-pool:${slug}`;
    const socket = this.getOrCreateSocket('/workflows');
    const rooms = this.subscriptions.get('/workflows')!;
    if (!rooms.has(room)) {
      rooms.add(room);
      socket.emit('join', { room });
    }
  }

  subscribeJob(jobId: string): void {
    const room = `job:${jobId}`;
    const socket = this.getOrCreateSocket('/jobs');
    const rooms = this.subscriptions.get('/jobs')!;
    if (!rooms.has(room)) {
      rooms.add(room);
      socket.emit('join', { room });
    }
  }

  unsubscribe(room: string): void {
    // Determine namespace from room prefix
    const namespace = this.resolveNamespace(room);
    if (!namespace) return;

    const rooms = this.subscriptions.get(namespace);
    if (!rooms || !rooms.has(room)) return;

    const socket = this.sockets.get(namespace);
    if (socket) {
      socket.emit('leave', { room });
    }
    rooms.delete(room);

    this.cleanupNamespace(namespace);
  }

  private resolveNamespace(room: string): SocketNamespace | null {
    if (room.startsWith('assembly-line:') || room.startsWith('worker-pool:')) {
      return '/workflows';
    }
    if (room.startsWith('job:')) {
      return '/jobs';
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Typed event listeners
  // -------------------------------------------------------------------------

  onEvent<
    NS extends SocketNamespace,
    E extends string & keyof NamespaceEventMap[NS],
  >(
    namespace: NS,
    event: E,
    callback: (data: NamespaceEventMap[NS][E]) => void,
  ): () => void {
    const socket = this.getOrCreateSocket(namespace);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on(event, callback as any);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.off(event, callback as any);
    };
  }

  // -------------------------------------------------------------------------
  // Interactive namespace — sending responses
  // -------------------------------------------------------------------------

  sendInteractiveResponse(
    jobId: string,
    response: { questionId: string; answer: string },
  ): void {
    const socket = this.getOrCreateSocket('/interactive');
    socket.emit('answer', { jobId, ...response });
  }

  // -------------------------------------------------------------------------
  // Testing helpers (not part of public API contract)
  // -------------------------------------------------------------------------

  /** @internal — for testing only */
  _getManager(): Manager | null {
    return this.manager;
  }

  /** @internal — for testing only */
  _getSockets(): Map<SocketNamespace, Socket> {
    return this.sockets;
  }

  /** @internal — for testing only */
  _getSubscriptions(): Map<SocketNamespace, Set<string>> {
    return this.subscriptions;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const socketManager = new SocketManager();
