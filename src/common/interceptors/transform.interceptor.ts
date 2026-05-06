import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { STATUS_CODES } from 'http';
import { ResponseDto } from '../dto';

interface HttpResponse {
  statusCode: number;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T | { message: string; data?: T },
  ResponseDto<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseDto<T>> {
    const httpResponse = context.switchToHttp().getResponse<HttpResponse>();

    return next.handle().pipe(
      map((data: unknown) => {
        const statusCode = httpResponse.statusCode || 200;
        if (
          data &&
          typeof data === 'object' &&
          'Metadata' in data &&
          'Data' in data
        ) {
          return data as ResponseDto<T>;
        }
        if (data && typeof data === 'object' && 'message' in data) {
          const custom = data as { message: string; data?: T };

          return {
            Metadata: {
              code: statusCode,
              message: custom.message,
            },
            Data: custom.data ?? null,
          };
        }
        return {
          Metadata: {
            code: statusCode,
            message: STATUS_CODES[statusCode] ?? 'Unknown Status',
          },
          Data: (data as T) ?? null,
        };
      }),
    );
  }
}
