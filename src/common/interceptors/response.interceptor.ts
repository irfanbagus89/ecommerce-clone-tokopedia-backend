import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';
import { STATUS_CODES } from 'http';

type MessageType = {
  message: string;
  statusCode: number;
};

export interface StandardResponse<T> {
  Message: MessageType;
  Data: T | null;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  StandardResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<StandardResponse<T>> {
    const httpContext = context.switchToHttp();
    const res = httpContext.getResponse<Response>();

    return next.handle().pipe(
      map((data: T): StandardResponse<T> => {
        // Jika controller sudah mengembalikan struktur dengan message & data
        if (data && typeof data === 'object' && 'message' in data) {
          const typedData = data as {
            message: string;
            data?: T;
          };

          return {
            Message: {
              message: typedData.message,
              statusCode: res.statusCode,
            },
            Data: typedData.data ?? null,
          };
        }

        // Default case
        return {
          Message: {
            message: STATUS_CODES[res.statusCode] ?? 'Success',
            statusCode: res.statusCode,
          },
          Data: data ?? null,
        };
      }),
    );
  }
}
