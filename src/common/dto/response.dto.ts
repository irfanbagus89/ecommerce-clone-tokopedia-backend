export class MessageDto {
  code: number;

  message: string;
}

export class ResponseDto<T = any> {
  Data: T | null;

  Metadata: MessageDto;
}

export class PaginationDto {
  page: number;

  limit: number;

  total: number;

  totalPages: number;
}

export class PaginatedResponseDto<T = any> {
  Data: {
    items?: T[];
    [key: string]: any;
  };

  Metadata: MessageDto;
}
