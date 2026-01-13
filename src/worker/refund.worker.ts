import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class RefundWorker {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  async run() {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const refunds = await client.query<{ id: string; order_id: string }>(`
        SELECT r.id, p.order_id
        FROM refunds r
        JOIN payments p ON p.id = r.payment_id
        WHERE r.status = 'approved'
      `);

      for (const row of refunds.rows) {
        await client.query(
          `UPDATE orders
           SET status = 'refunded', payment_status = 'refunded'
           WHERE id = $1`,
          [row.order_id],
        );
      }

      await client.query('COMMIT');
      return { data: refunds.rowCount, message: 'Refunds synced' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
