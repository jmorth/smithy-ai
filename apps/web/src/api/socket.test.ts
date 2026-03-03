import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoutingKeys } from '@smithy/shared';

// ---------------------------------------------------------------------------
// Mock socket.io-client
// ---------------------------------------------------------------------------

const mockSocketOn = vi.fn();
const mockSocketOff = vi.fn();
const mockSocketEmit = vi.fn();
const mockSocketConnect = vi.fn();
const mockSocketDisconnect = vi.fn();

function createMockSocket() {
  return {
    on: mockSocketOn,
    off: mockSocketOff,
    emit: mockSocketEmit,
    connect: mockSocketConnect,
    disconnect: mockSocketDisconnect,
  };
}

const mockManagerOn = vi.fn();
const mockManagerSocket = vi.fn();
let mockEngine: { close: ReturnType<typeof vi.fn> } | null = null;

vi.mock('socket.io-client', () => {
  return {
    Manager: vi.fn().mockImplementation((_url: string, _opts: unknown) => {
      mockEngine = { close: vi.fn() };
      return {
        on: mockManagerOn,
        socket: mockManagerSocket,
        engine: mockEngine,
      };
    }),
  };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  SocketManager,
  socketManager,
  type ConnectionState,
  type SocketNamespace,
} from './socket';
import { Manager } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function triggerManagerEvent(event: string, ...args: unknown[]): void {
  const calls = mockManagerOn.mock.calls.filter(
    (c: unknown[]) => c[0] === event,
  );
  if (calls.length > 0) {
    const lastCall = calls[calls.length - 1]!;
    (lastCall[1] as (...a: unknown[]) => void)(...args);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockManagerSocket.mockImplementation(() => createMockSocket());
});

// ===== Singleton export ====================================================

describe('socketManager singleton', () => {
  it('exports a SocketManager instance', () => {
    expect(socketManager).toBeInstanceOf(SocketManager);
  });
});

// ===== Constructor / URL resolution ========================================

describe('SocketManager constructor', () => {
  it('accepts a custom URL', () => {
    const manager = new SocketManager('http://custom:4000');
    manager.connect();
    expect(Manager).toHaveBeenCalledWith(
      'http://custom:4000',
      expect.any(Object),
    );
    manager.disconnect();
  });

  it('resolves URL from VITE_API_URL when it is an absolute URL', () => {
    const origMeta = import.meta.env.VITE_API_URL;
    import.meta.env.VITE_API_URL = 'http://api.example.com:3000/api';

    const manager = new SocketManager();
    manager.connect();
    expect(Manager).toHaveBeenCalledWith(
      'http://api.example.com:3000',
      expect.any(Object),
    );
    manager.disconnect();

    import.meta.env.VITE_API_URL = origMeta;
  });

  it('falls back to window.location.origin for relative VITE_API_URL', () => {
    const origMeta = import.meta.env.VITE_API_URL;
    import.meta.env.VITE_API_URL = '/api';

    // jsdom provides window.location.origin
    const manager = new SocketManager();
    manager.connect();
    expect(Manager).toHaveBeenCalledWith(
      window.location.origin,
      expect.any(Object),
    );
    manager.disconnect();

    import.meta.env.VITE_API_URL = origMeta;
  });

  it('uses window.location.origin when VITE_API_URL is not set', () => {
    const origMeta = import.meta.env.VITE_API_URL;
    delete import.meta.env.VITE_API_URL;

    const manager = new SocketManager();
    manager.connect();
    expect(Manager).toHaveBeenCalledWith(
      window.location.origin,
      expect.any(Object),
    );
    manager.disconnect();

    import.meta.env.VITE_API_URL = origMeta;
  });
});

// ===== Connection lifecycle ================================================

describe('connect()', () => {
  let manager: SocketManager;

  beforeEach(() => {
    manager = new SocketManager('http://localhost:3000');
  });

  afterEach(() => {
    manager.disconnect();
  });

  it('creates a Manager with reconnection settings', () => {
    manager.connect();

    expect(Manager).toHaveBeenCalledWith('http://localhost:3000', {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0,
      reconnectionAttempts: Infinity,
    });
  });

  it('registers open/close/reconnect_attempt/reconnect/error handlers', () => {
    manager.connect();

    const events = mockManagerOn.mock.calls.map((c: unknown[]) => c[0]);
    expect(events).toContain('open');
    expect(events).toContain('close');
    expect(events).toContain('reconnect_attempt');
    expect(events).toContain('reconnect');
    expect(events).toContain('error');
  });

  it('is idempotent — calling connect() twice does not create a second Manager', () => {
    manager.connect();
    manager.connect();
    expect(Manager).toHaveBeenCalledTimes(1);
  });
});

describe('disconnect()', () => {
  let manager: SocketManager;

  beforeEach(() => {
    manager = new SocketManager('http://localhost:3000');
    manager.connect();
  });

  it('disconnects all namespace sockets', () => {
    // Create some namespace sockets
    manager.subscribeAssemblyLine('test-line');
    manager.subscribeJob('job-1');

    expect(mockSocketConnect).toHaveBeenCalledTimes(2);

    manager.disconnect();

    expect(mockSocketDisconnect).toHaveBeenCalled();
    expect(manager._getSockets().size).toBe(0);
    expect(manager._getSubscriptions().size).toBe(0);
  });

  it('sets state to disconnected', () => {
    manager.disconnect();
    expect(manager.getState()).toBe('disconnected');
  });

  it('closes the engine', () => {
    manager.disconnect();
    expect(mockEngine?.close).toHaveBeenCalled();
  });

  it('is safe to call when not connected', () => {
    const freshManager = new SocketManager('http://localhost:3000');
    expect(() => freshManager.disconnect()).not.toThrow();
  });
});

// ===== Connection state ====================================================

describe('connection state', () => {
  let manager: SocketManager;

  beforeEach(() => {
    manager = new SocketManager('http://localhost:3000');
  });

  afterEach(() => {
    manager.disconnect();
  });

  it('starts as disconnected', () => {
    expect(manager.getState()).toBe('disconnected');
  });

  it('transitions to connected on manager open event', () => {
    manager.connect();
    triggerManagerEvent('open');
    expect(manager.getState()).toBe('connected');
  });

  it('transitions to reconnecting on close event (while manager exists)', () => {
    manager.connect();
    triggerManagerEvent('open');
    triggerManagerEvent('close', 'transport close');
    expect(manager.getState()).toBe('reconnecting');
  });

  it('transitions to reconnecting on reconnect_attempt event', () => {
    manager.connect();
    triggerManagerEvent('reconnect_attempt');
    expect(manager.getState()).toBe('reconnecting');
  });

  it('transitions to connected on reconnect event', () => {
    manager.connect();
    triggerManagerEvent('reconnect_attempt');
    triggerManagerEvent('reconnect');
    expect(manager.getState()).toBe('connected');
  });

  it('transitions to reconnecting on error event', () => {
    manager.connect();
    triggerManagerEvent('error', new Error('connection failed'));
    expect(manager.getState()).toBe('reconnecting');
  });

  it('does not re-emit when state is already reconnecting on error', () => {
    manager.connect();
    const callback = vi.fn();
    manager.onStateChange(callback);

    triggerManagerEvent('reconnect_attempt');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('reconnecting');

    triggerManagerEvent('error', new Error('fail'));
    // Should not be called again because state is already 'reconnecting'
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('onStateChange()', () => {
  let manager: SocketManager;

  beforeEach(() => {
    manager = new SocketManager('http://localhost:3000');
    manager.connect();
  });

  afterEach(() => {
    manager.disconnect();
  });

  it('invokes callback on state changes', () => {
    const callback = vi.fn();
    manager.onStateChange(callback);

    triggerManagerEvent('open');
    expect(callback).toHaveBeenCalledWith('connected');

    triggerManagerEvent('close', 'transport close');
    expect(callback).toHaveBeenCalledWith('reconnecting');
  });

  it('returns an unsubscribe function', () => {
    const callback = vi.fn();
    const unsub = manager.onStateChange(callback);

    triggerManagerEvent('open');
    expect(callback).toHaveBeenCalledTimes(1);

    unsub();
    triggerManagerEvent('close', 'transport close');
    // Should not be called after unsubscribe
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not invoke callback when state does not actually change', () => {
    const callback = vi.fn();
    manager.onStateChange(callback);

    triggerManagerEvent('open');
    triggerManagerEvent('open'); // same state again
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('supports multiple callbacks', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    manager.onStateChange(cb1);
    manager.onStateChange(cb2);

    triggerManagerEvent('open');
    expect(cb1).toHaveBeenCalledWith('connected');
    expect(cb2).toHaveBeenCalledWith('connected');
  });
});

// ===== Namespace management ================================================

describe('namespace management', () => {
  let manager: SocketManager;

  beforeEach(() => {
    manager = new SocketManager('http://localhost:3000');
    manager.connect();
  });

  afterEach(() => {
    manager.disconnect();
  });

  it('creates namespace sockets lazily on first subscription', () => {
    expect(mockManagerSocket).not.toHaveBeenCalled();

    manager.subscribeAssemblyLine('line-1');

    expect(mockManagerSocket).toHaveBeenCalledWith('/workflows');
    expect(mockSocketConnect).toHaveBeenCalledTimes(1);
  });

  it('reuses existing namespace socket for subsequent subscriptions', () => {
    manager.subscribeAssemblyLine('line-1');
    manager.subscribeAssemblyLine('line-2');

    expect(mockManagerSocket).toHaveBeenCalledTimes(1);
    expect(mockSocketConnect).toHaveBeenCalledTimes(1);
  });

  it('creates separate sockets for different namespaces', () => {
    manager.subscribeAssemblyLine('line-1');
    manager.subscribeJob('job-1');

    expect(mockManagerSocket).toHaveBeenCalledTimes(2);
    expect(mockManagerSocket).toHaveBeenCalledWith('/workflows');
    expect(mockManagerSocket).toHaveBeenCalledWith('/jobs');
  });

  it('cleans up namespace socket when all rooms unsubscribe', () => {
    manager.subscribeAssemblyLine('line-1');
    manager.subscribeAssemblyLine('line-2');

    manager.unsubscribe('assembly-line:line-1');
    // Still has line-2, should not disconnect
    expect(mockSocketDisconnect).not.toHaveBeenCalled();

    manager.unsubscribe('assembly-line:line-2');
    // Now empty, should disconnect
    expect(mockSocketDisconnect).toHaveBeenCalled();
    expect(manager._getSockets().has('/workflows')).toBe(false);
  });

  it('throws when subscribing without connect()', () => {
    const freshManager = new SocketManager('http://localhost:3000');
    expect(() => freshManager.subscribeAssemblyLine('line-1')).toThrow(
      'SocketManager not connected',
    );
  });
});

// ===== Room subscriptions ==================================================

describe('subscribeAssemblyLine()', () => {
  let manager: SocketManager;

  beforeEach(() => {
    manager = new SocketManager('http://localhost:3000');
    manager.connect();
  });

  afterEach(() => {
    manager.disconnect();
  });

  it('emits join event with the correct room', () => {
    manager.subscribeAssemblyLine('my-line');

    expect(mockSocketEmit).toHaveBeenCalledWith('join', {
      room: 'assembly-line:my-line',
    });
  });

  it('does not emit join twice for the same slug', () => {
    manager.subscribeAssemblyLine('my-line');
    manager.subscribeAssemblyLine('my-line');

    expect(mockSocketEmit).toHaveBeenCalledTimes(1);
  });

  it('tracks the room in subscriptions', () => {
    manager.subscribeAssemblyLine('my-line');

    const rooms = manager._getSubscriptions().get('/workflows');
    expect(rooms).toBeDefined();
    expect(rooms!.has('assembly-line:my-line')).toBe(true);
  });
});

describe('subscribeWorkerPool()', () => {
  let manager: SocketManager;

  beforeEach(() => {
    manager = new SocketManager('http://localhost:3000');
    manager.connect();
  });

  afterEach(() => {
    manager.disconnect();
  });

  it('emits join event with the correct room', () => {
    manager.subscribeWorkerPool('my-pool');

    expect(mockSocketEmit).toHaveBeenCalledWith('join', {
      room: 'worker-pool:my-pool',
    });
  });

  it('does not emit join twice for the same slug', () => {
    manager.subscribeWorkerPool('my-pool');
    manager.subscribeWorkerPool('my-pool');

    expect(mockSocketEmit).toHaveBeenCalledTimes(1);
  });

  it('uses the /workflows namespace', () => {
    manager.subscribeWorkerPool('my-pool');

    expect(mockManagerSocket).toHaveBeenCalledWith('/workflows');
  });
});

describe('subscribeJob()', () => {
  let manager: SocketManager;

  beforeEach(() => {
    manager = new SocketManager('http://localhost:3000');
    manager.connect();
  });

  afterEach(() => {
    manager.disconnect();
  });

  it('emits join event with the correct room', () => {
    manager.subscribeJob('job-abc-123');

    expect(mockSocketEmit).toHaveBeenCalledWith('join', {
      room: 'job:job-abc-123',
    });
  });

  it('uses the /jobs namespace', () => {
    manager.subscribeJob('job-abc-123');

    expect(mockManagerSocket).toHaveBeenCalledWith('/jobs');
  });
});

describe('unsubscribe()', () => {
  let manager: SocketManager;

  beforeEach(() => {
    manager = new SocketManager('http://localhost:3000');
    manager.connect();
  });

  afterEach(() => {
    manager.disconnect();
  });

  it('emits leave event on the correct namespace', () => {
    manager.subscribeAssemblyLine('line-1');
    mockSocketEmit.mockClear();

    manager.unsubscribe('assembly-line:line-1');

    expect(mockSocketEmit).toHaveBeenCalledWith('leave', {
      room: 'assembly-line:line-1',
    });
  });

  it('removes room from subscriptions', () => {
    manager.subscribeAssemblyLine('line-1');
    manager.unsubscribe('assembly-line:line-1');

    const rooms = manager._getSubscriptions().get('/workflows');
    // After cleanup, the namespace should be removed entirely
    expect(rooms).toBeUndefined();
  });

  it('is a no-op for unknown rooms', () => {
    expect(() => manager.unsubscribe('unknown:room')).not.toThrow();
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  it('is a no-op for rooms not currently subscribed', () => {
    manager.subscribeAssemblyLine('line-1');
    mockSocketEmit.mockClear();

    manager.unsubscribe('assembly-line:line-999');
    expect(mockSocketEmit).not.toHaveBeenCalled();
  });

  it('resolves /jobs namespace for job rooms', () => {
    manager.subscribeJob('j1');
    mockSocketEmit.mockClear();

    manager.unsubscribe('job:j1');

    expect(mockSocketEmit).toHaveBeenCalledWith('leave', { room: 'job:j1' });
  });

  it('resolves /workflows namespace for worker-pool rooms', () => {
    manager.subscribeWorkerPool('pool-1');
    mockSocketEmit.mockClear();

    manager.unsubscribe('worker-pool:pool-1');

    expect(mockSocketEmit).toHaveBeenCalledWith('leave', {
      room: 'worker-pool:pool-1',
    });
  });
});

// ===== Typed event listeners ===============================================

describe('onEvent()', () => {
  let manager: SocketManager;

  beforeEach(() => {
    manager = new SocketManager('http://localhost:3000');
    manager.connect();
  });

  afterEach(() => {
    manager.disconnect();
  });

  it('registers an event listener on the correct namespace socket', () => {
    const callback = vi.fn();
    manager.onEvent('/workflows', RoutingKeys.PACKAGE_CREATED, callback);

    expect(mockManagerSocket).toHaveBeenCalledWith('/workflows');
    expect(mockSocketOn).toHaveBeenCalledWith(
      'package.created',
      expect.any(Function),
    );
  });

  it('returns an unsubscribe function that removes the listener', () => {
    const callback = vi.fn();
    const unsub = manager.onEvent(
      '/jobs',
      RoutingKeys.JOB_STARTED,
      callback,
    );

    expect(mockSocketOn).toHaveBeenCalled();

    unsub();
    expect(mockSocketOff).toHaveBeenCalledWith(
      'job.started',
      expect.any(Function),
    );
  });

  it('creates the namespace socket lazily', () => {
    const callback = vi.fn();
    manager.onEvent('/interactive', 'question', callback);

    expect(mockManagerSocket).toHaveBeenCalledWith('/interactive');
    expect(mockSocketConnect).toHaveBeenCalled();
  });
});

// ===== Interactive responses ===============================================

describe('sendInteractiveResponse()', () => {
  let manager: SocketManager;

  beforeEach(() => {
    manager = new SocketManager('http://localhost:3000');
    manager.connect();
  });

  afterEach(() => {
    manager.disconnect();
  });

  it('emits answer event on /interactive namespace', () => {
    manager.sendInteractiveResponse('job-1', {
      questionId: 'q1',
      answer: 'yes',
    });

    expect(mockManagerSocket).toHaveBeenCalledWith('/interactive');
    expect(mockSocketEmit).toHaveBeenCalledWith('answer', {
      jobId: 'job-1',
      questionId: 'q1',
      answer: 'yes',
    });
  });
});

// ===== disconnect during close ==============================================

describe('disconnect during close event', () => {
  it('sets state to disconnected (not reconnecting) when manager is null', () => {
    const manager = new SocketManager('http://localhost:3000');
    manager.connect();

    // Capture the close handler
    const closeCall = mockManagerOn.mock.calls.find(
      (c: unknown[]) => c[0] === 'close',
    );
    const closeHandler = closeCall![1] as (reason: string) => void;

    // Disconnect first (sets manager to null)
    manager.disconnect();
    expect(manager.getState()).toBe('disconnected');

    // Now fire close — should stay disconnected, not go to reconnecting
    closeHandler('transport close');
    expect(manager.getState()).toBe('disconnected');
  });
});
