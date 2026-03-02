import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    // Placeholder: extract user ID from token.
    // Task 135 will replace this with proper JWT verification.
    request.user = { id: token };
    return true;
  }
}
