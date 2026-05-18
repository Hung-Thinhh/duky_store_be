import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

type ApiResponse<T> = {
  EC: number;
  EM: string;
  DT: T;
};

@Injectable()
export class ApiResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T> | T> {
    return next.handle().pipe(
      map((data) => {
        if (typeof data === 'string' || Buffer.isBuffer(data)) {
          return data;
        }

        if (this.isAlreadyWrapped(data)) {
          return data;
        }

        return {
          EC: 0,
          EM: this.resolveMessage(data),
          DT: data,
        };
      }),
    );
  }

  private isAlreadyWrapped(data: unknown): data is ApiResponse<T> {
    return (
      typeof data === 'object' &&
      data !== null &&
      'EC' in data &&
      'EM' in data &&
      'DT' in data
    );
  }

  private resolveMessage(data: unknown) {
    if (
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
    ) {
      return data.message;
    }

    return 'success';
  }
}
