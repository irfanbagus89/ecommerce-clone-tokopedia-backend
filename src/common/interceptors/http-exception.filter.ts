import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

interface HttpErrorResponse {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  [key: string]: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = 500;
    let message = 'Internal Server Error';
    let errorData: unknown = null;

    if (exception instanceof HttpException) {
      const response = exception.getResponse() as HttpErrorResponse;
      status = exception.getStatus();

      if (typeof response === 'string') {
        message = response;
      } else {
        // message bisa string atau array -> jadikan string
        if (Array.isArray(response.message)) {
          message = response.message.join(', ');
        } else if (typeof response.message === 'string') {
          message = response.message;
        } else {
          message = exception.message;
        }

        errorData = response.error ?? null;
      }
    }

    res.status(status).json({
      Message: {
        message,
        statusCode: status,
      },
      Data: errorData,
    });
  }
}
