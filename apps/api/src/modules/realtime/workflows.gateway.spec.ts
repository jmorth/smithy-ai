import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { WorkflowsGateway } from './workflows.gateway';
import { REALTIME_NAMESPACE_WORKFLOWS } from './realtime.constants';
import { Socket } from 'socket.io';

describe('WorkflowsGateway', () => {
  let gateway: WorkflowsGateway;

  beforeEach(() => {
    gateway = new WorkflowsGateway();
  });

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
  });

  describe('handleConnection', () => {
    it('logs client connection at debug level', () => {
      const debugSpy = vi
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => undefined);
      const mockClient = { id: 'test-client-123' } as Socket;

      gateway.handleConnection(mockClient);

      expect(debugSpy).toHaveBeenCalledWith(
        'Client connected: test-client-123',
      );
      debugSpy.mockRestore();
    });
  });

  describe('handleDisconnect', () => {
    it('logs client disconnection at debug level', () => {
      const debugSpy = vi
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => undefined);
      const mockClient = { id: 'test-client-456' } as Socket;

      gateway.handleDisconnect(mockClient);

      expect(debugSpy).toHaveBeenCalledWith(
        'Client disconnected: test-client-456',
      );
      debugSpy.mockRestore();
    });
  });
});
