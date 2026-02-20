import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApplicationException } from '../../application/exceptions/application.exception';

/**
 * Standard error response shape returned by this filter.
 */
interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  details?: Record<string, unknown>;
}

/**
 * Global exception filter that catches all unhandled exceptions and converts
 * them into consistent, structured HTTP error responses.
 *
 * Mapping strategy:
 * - NestJS HttpException (including ValidationPipe errors) → their HTTP status
 * - ApplicationException → statusCode stored on the exception
 * - Unknown errors → 500 Internal Server Error (no internal details exposed)
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = this.buildErrorResponse(exception, request);

    this.logException(exception, errorResponse, request);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  /**
   * Builds the structured error response object from the thrown exception.
   */
  private buildErrorResponse(exception: unknown, request: Request): ErrorResponse {
    const timestamp = new Date().toISOString();
    const path = request.url;

    // Handle NestJS HttpException (ValidationPipe throws BadRequestException)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      return {
        statusCode: status,
        message: this.extractMessage(exceptionResponse),
        error: this.httpStatusText(status),
        timestamp,
        path,
        details: this.extractDetails(exceptionResponse),
      };
    }

    // Handle application-layer business rule exceptions
    if (exception instanceof ApplicationException) {
      return {
        statusCode: exception.statusCode,
        message: exception.message,
        error: this.httpStatusText(exception.statusCode),
        timestamp,
        path,
        ...(exception.details ? { details: exception.details } : {}),
      };
    }

    // Fallback for unexpected errors — never expose internals
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An internal error occurred. Please try again later.',
      error: 'Internal Server Error',
      timestamp,
      path,
    };
  }

  /**
   * Extracts a human-readable message from an HttpException response.
   */
  private extractMessage(exceptionResponse: string | object): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }
    const obj = exceptionResponse as Record<string, unknown>;
    if (typeof obj.message === 'string') {
      return obj.message;
    }
    if (Array.isArray(obj.message)) {
      return (obj.message as string[]).join(', ');
    }
    return 'An error occurred';
  }

  /**
   * Extracts structured details from a ValidationPipe BadRequestException response.
   * The custom exceptionFactory in main.ts produces { statusCode, message, errors }.
   */
  private extractDetails(
    exceptionResponse: string | object,
  ): Record<string, unknown> | undefined {
    if (typeof exceptionResponse !== 'object' || exceptionResponse === null) {
      return undefined;
    }
    const obj = exceptionResponse as Record<string, unknown>;
    // Our custom exceptionFactory produces an `errors` array
    if (Array.isArray(obj.errors) && obj.errors.length > 0) {
      return { errors: obj.errors };
    }
    return undefined;
  }

  /**
   * Returns the standard HTTP status text for a numeric status code.
   */
  private httpStatusText(status: number): string {
    const map: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      503: 'Service Unavailable',
    };
    return map[status] ?? 'Error';
  }

  /**
   * Logs the exception at the appropriate severity level.
   * Stack traces are only logged for 5xx errors.
   */
  private logException(
    exception: unknown,
    errorResponse: ErrorResponse,
    request: Request,
  ): void {
    const summary = `${request.method} ${request.url} → ${errorResponse.statusCode} ${errorResponse.message}`;

    if (errorResponse.statusCode >= 500) {
      this.logger.error(
        summary,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(summary);
    }
  }
}
