import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class ShippingReminderWorker {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  async run() {
    const client = await this.db.connect();
    try {
      const orders = await client.query(`
        SELECT id FROM orders
        WHERE status = 'processing'
          AND created_at < NOW() - INTERVAL '1 day'
      `);

      // Di sini kamu bisa panggil email / notif service
      return { data: orders.rowCount, message: 'Shipping reminders queued' };
    } finally {
      client.release();
    }
  }
}
