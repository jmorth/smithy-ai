import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

// TODO: Replace with JWT validation for multi-tenant
const DEFAULT_USER = {
  id: 'default-user',
  email: 'admin@smithy.local',
  name: 'Admin',
};

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // TODO: Replace with JWT validation for multi-tenant — also handle switchToWs() for WebSocket contexts
    request.user = DEFAULT_USER;
    return true;
  }
}
