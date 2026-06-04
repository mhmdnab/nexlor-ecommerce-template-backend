import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * Global exception filter. Every error leaves the API in the same shape:
 *   { statusCode, message, error, path }
 * so clients never have to guess. Prisma's known errors are mapped to sensible
 * HTTP codes (unique violation -> 409, not found -> 404).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as { message?: string | string[]; error?: string };
        message = body.message ?? exception.message;
        error = body.error ?? exception.name;
      }
      error = HttpStatus[statusCode] ?? error;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ statusCode, message, error } = mapPrismaError(exception));
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      message,
      error,
      path: request.url,
    });
  }
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  message: string;
  error: string;
} {
  switch (e.code) {
    case 'P2002': {
      const target = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      return { statusCode: HttpStatus.CONFLICT, message: `A record with this ${target} already exists.`, error: 'Conflict' };
    }
    case 'P2025':
      return { statusCode: HttpStatus.NOT_FOUND, message: 'Record not found.', error: 'NotFound' };
    case 'P2003':
      return { statusCode: HttpStatus.BAD_REQUEST, message: 'Related record constraint failed.', error: 'BadRequest' };
    default:
      return { statusCode: HttpStatus.BAD_REQUEST, message: `Database error (${e.code}).`, error: 'BadRequest' };
  }
}
