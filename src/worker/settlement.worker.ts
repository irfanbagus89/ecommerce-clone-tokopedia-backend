import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class SettlementWorker {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  async run() {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const orders = await client.query<{ id: string }>(`
        SELECT id FROM orders
        WHERE status = 'delivered'
          AND payment_status = 'paid'
          AND settled_at IS NULL
      `);

      for (const row of orders.rows) {
        await client.query(
          `UPDATE orders
           SET status = 'completed', settled_at = NOW()
           WHERE id = $1`,
          [row.id],
        );
      }

      await client.query('COMMIT');
      return { data: orders.rowCount, message: 'Orders settled' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
