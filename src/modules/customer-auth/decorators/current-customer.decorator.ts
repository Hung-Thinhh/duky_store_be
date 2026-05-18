import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CustomerAuthUser } from '../types/customer-auth-user.type';

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CustomerAuthUser => {
    const request = context.switchToHttp().getRequest();
    return request.user;
  },
);
