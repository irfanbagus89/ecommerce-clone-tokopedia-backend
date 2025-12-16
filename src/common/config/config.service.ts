import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

interface EnvironmentVariables {
  PORT: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  NODE_ENV: string;
  DOMAIN_PROD: string;
}

@Injectable()
export class ConfigService {
  constructor(private config: NestConfigService<EnvironmentVariables>) {}

  get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    const value = this.config.get<EnvironmentVariables[K]>(key);
    if (!value) throw new Error(`Missing env var: ${key}`);
    return value;
  }

  get port(): number {
    return parseInt(this.get('PORT'), 10);
  }

  get jwtSecret(): string {
    return this.get('JWT_SECRET');
  }

  get jwtExpiresIn(): number {
    return 60 * 60 * 24 * 1000; // 1 Hari
  }

  get nodeEnv(): string {
    return this.get('NODE_ENV');
  }
  get getDomainProd(): string {
    return this.get('DOMAIN_PROD');
  }
}
