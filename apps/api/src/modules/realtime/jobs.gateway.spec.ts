import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { JobsGateway } from './jobs.gateway';
import { REALTIME_NAMESPACE_JOBS } from './realtime.constants';
import { Socket } from 'socket.io';

describe('JobsGateway', () => {
  let gateway: JobsGateway;

  beforeEach(() => {
    gateway = new JobsGateway();
  });

  describe('decorator metadata', () => {
    it('is configured with /jobs namespace', () => {
      const metadata = Reflect.getMetadata(
        'websockets:is_gateway',
        JobsGateway,
      );
      expect(metadata).toBe(true);

      const gatewayOptions = Reflect.getMetadata(
        'websockets:gateway_options',
        JobsGateway,
      );
      expect(gatewayOptions).toBeDefined();
      expect(gatewayOptions.namespace).toBe(REALTIME_NAMESPACE_JOBS);
    });
  });

  describe('handleConnection', () => {
    it('logs client connection at debug level', () => {
      const debugSpy = vi
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => undefined);
      const mockClient = { id: 'job-client-001' } as Socket;

      gateway.handleConnection(mockClient);

      expect(debugSpy).toHaveBeenCalledWith(
        'Client connected: job-client-001',
      );
      debugSpy.mockRestore();
    });
  });

  describe('handleDisconnect', () => {
    it('logs client disconnection at debug level', () => {
      const debugSpy = vi
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => undefined);
      const mockClient = { id: 'job-client-002' } as Socket;

      gateway.handleDisconnect(mockClient);

      expect(debugSpy).toHaveBeenCalledWith(
        'Client disconnected: job-client-002',
      );
      debugSpy.mockRestore();
    });
  });
});
