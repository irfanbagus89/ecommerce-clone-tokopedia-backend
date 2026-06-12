import { Module, Provider } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import {
  GoogleStrategy,
  isGoogleOAuthConfigured,
} from './strategies/google.strategy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { JwtModuleOptions } from '@nestjs/jwt';
import type { StringValue } from 'ms';

const googleStrategyProvider: Provider = {
  provide: GoogleStrategy,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    if (!isGoogleOAuthConfigured(configService)) {
      return null;
    }

    return new GoogleStrategy(configService);
  },
};

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret:
          config.get<string>('JWT_SECRET') ||
          'default-secret-key-change-in-production',
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_TOKEN_EXPIRATION') ||
            '') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, googleStrategyProvider],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
