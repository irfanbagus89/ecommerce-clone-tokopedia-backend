import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class RetryCleanupWorker {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  async run() {
    const client = await this.db.connect();
    try {
      const res = await client.query(`
        DELETE FROM payment_attempts
        WHERE created_at < NOW() - INTERVAL '1 day'
      `);

      return { data: res.rowCount, message: 'Old payment attempts cleaned' };
    } finally {
      client.release();
    }
  }
}
