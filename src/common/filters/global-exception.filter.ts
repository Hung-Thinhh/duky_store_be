import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

type ErrorResponseBody = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  code?: string;
  details?: unknown;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    console.error('=== NestJS Exception Caught ===', exception);
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = this.getStatus(exception);
    const exceptionResponse = this.getExceptionResponse(exception);
    const message = this.getMessage(exceptionResponse, status);
    response.status(status).json({
      EC: status,
      EM: message,
      DT: this.getDetails(exception, exceptionResponse, status, request.url),
    });
  }

  private getStatus(exception: unknown) {
    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getExceptionResponse(exception: unknown): ErrorResponseBody {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();

    return typeof response === 'string' ? { message: response } : response;
  }

  private getMessage(response: ErrorResponseBody, status: number) {
    if (Array.isArray(response.message)) {
      return response.message[0] ?? this.getDefaultMessage(status);
    }

    return response.message ?? this.getDefaultMessage(status);
  }

  private getDetails(
    exception: unknown,
    response: ErrorResponseBody,
    status: number,
    path: string,
  ) {
    const base = {
      code: response.code ?? this.getCode(response.error, status),
      path,
      timestamp: new Date().toISOString(),
    };

    if (response.details) {
      return { ...base, details: response.details };
    }

    if (Array.isArray(response.message)) {
      return { ...base, details: response.message };
    }

    if (
      status === 500 &&
      this.configService.get<string>('NODE_ENV') !== 'development'
    ) {
      return base;
    }

    return exception instanceof Error
      ? { ...base, details: { name: exception.name } }
      : base;
  }

  private getCode(error: string | undefined, status: number) {
    const label = error ?? HttpStatus[status] ?? 'Error';

    return `${status}_${label}`
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
  }

  private getDefaultMessage(status: number) {
    return status === 500 ? 'Internal server error' : 'Request failed';
  }
}
