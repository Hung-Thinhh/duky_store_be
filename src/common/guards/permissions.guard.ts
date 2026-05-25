import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { AuthUser } from '../../modules/auth/types/auth-user.type';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied. No user session found.');
    }

    // SUPER_ADMIN và ADMIN có đặc quyền '*' được phép đi qua mọi API chặn
    const hasAllAccess = user.permissions?.includes('*');
    if (hasAllAccess) {
      return true;
    }

    // Kiểm tra xem danh sách permissions của user có chứa đầy đủ các permissions yêu cầu hay không
    const hasPermission = requiredPermissions.every((permission) =>
      user.permissions?.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied. You do not have the required permission(s): ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
