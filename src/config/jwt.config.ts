import { ConfigService } from '@nestjs/config';

export const jwtConfig = {
  secret: process.env.JWT_SECRET || '',
  accessTokenExpiration: process.env.JWT_ACCESS_TOKEN_EXPIRATION || '',
  refreshTokenExpiration: process.env.JWT_REFRESH_TOKEN_EXPIRATION || '',
};

export const getJwtConfig = (configService: ConfigService) => ({
  secret: configService.get<string>('JWT_SECRET', ''),
  accessTokenExpiration: configService.get<string>(
    'JWT_ACCESS_TOKEN_EXPIRATION',
    '',
  ),
  refreshTokenExpiration: configService.get<string>(
    'JWT_REFRESH_TOKEN_EXPIRATION',
    '',
  ),
});
