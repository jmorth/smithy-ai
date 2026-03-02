import { describe, it, expect } from 'vitest';
import { OrchestratorEventBus, ORCHESTRATOR_EVENT_BUS } from './orchestrator-event-bus';
import { EventEmitter } from 'events';

describe('OrchestratorEventBus', () => {
  it('is a class that extends EventEmitter', () => {
    const bus = new OrchestratorEventBus();
    expect(bus).toBeInstanceOf(EventEmitter);
  });

  it('ORCHESTRATOR_EVENT_BUS token is defined', () => {
    expect(ORCHESTRATOR_EVENT_BUS).toBeDefined();
  });

  it('can emit and receive events', () => {
    const bus = new OrchestratorEventBus();
    let received: unknown;
    bus.on('test', (data) => { received = data; });
    bus.emit('test', { foo: 'bar' });
    expect(received).toEqual({ foo: 'bar' });
  });
});
