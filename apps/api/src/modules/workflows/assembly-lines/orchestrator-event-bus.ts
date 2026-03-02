import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

export const ORCHESTRATOR_EVENT_BUS = Symbol('ORCHESTRATOR_EVENT_BUS');

@Injectable()
export class OrchestratorEventBus extends EventEmitter {}
