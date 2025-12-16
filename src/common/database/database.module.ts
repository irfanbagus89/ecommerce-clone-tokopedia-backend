import { Module, Global } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  providers: [
    {
      provide: 'PG_POOL',
      useFactory: (config: ConfigService): Pool => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          return new Pool({
            host: config.get<string>('PG_HOST'),
            port: config.get<number>('PG_PORT'),
            user: config.get<string>('PG_USER'),
            password: config.get<string>('PG_PASSWORD'),
            database: config.get<string>('PG_DB'),
          });
        } catch (err: unknown) {
          if (err instanceof Error) {
            throw new Error(`Failed to create DB pool: ${err.message}`);
          }
          throw new Error('Unknown error while creating DB pool');
        }
      },

      inject: [ConfigService],
    },
  ],
  exports: ['PG_POOL'],
})
export class DatabaseModule {}
