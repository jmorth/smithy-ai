import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { InteractiveGateway } from './interactive.gateway';
import { REALTIME_NAMESPACE_INTERACTIVE } from './realtime.constants';
import { Socket } from 'socket.io';

describe('InteractiveGateway', () => {
  let gateway: InteractiveGateway;

  beforeEach(() => {
    gateway = new InteractiveGateway();
  });

  describe('decorator metadata', () => {
    it('is configured with /interactive namespace', () => {
      const metadata = Reflect.getMetadata(
        'websockets:is_gateway',
        InteractiveGateway,
      );
      expect(metadata).toBe(true);

      const gatewayOptions = Reflect.getMetadata(
        'websockets:gateway_options',
        InteractiveGateway,
      );
      expect(gatewayOptions).toBeDefined();
      expect(gatewayOptions.namespace).toBe(REALTIME_NAMESPACE_INTERACTIVE);
    });
  });

  describe('handleConnection', () => {
    it('logs client connection at debug level', () => {
      const debugSpy = vi
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => undefined);
      const mockClient = { id: 'interactive-client-001' } as Socket;

      gateway.handleConnection(mockClient);

      expect(debugSpy).toHaveBeenCalledWith(
        'Client connected: interactive-client-001',
      );
      debugSpy.mockRestore();
    });
  });

  describe('handleDisconnect', () => {
    it('logs client disconnection at debug level', () => {
      const debugSpy = vi
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => undefined);
      const mockClient = { id: 'interactive-client-002' } as Socket;

      gateway.handleDisconnect(mockClient);

      expect(debugSpy).toHaveBeenCalledWith(
        'Client disconnected: interactive-client-002',
      );
      debugSpy.mockRestore();
    });
  });
});
