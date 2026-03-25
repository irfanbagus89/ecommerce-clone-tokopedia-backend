import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Interface untuk payload saat membuat token (tanpa iat/exp)
export interface JwtPayloadCreate {
  sub: string;
  email: string;
  role: string;
}

// Interface untuk payload token yang sudah diverifikasi (dengan iat/exp)
export interface JwtPayload extends JwtPayloadCreate {
  iat: number;
  exp: number;
}

export interface RequestWithUser {
  user: JwtPayload;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    return data ? user[data] : user;
  },
);
