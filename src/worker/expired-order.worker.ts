import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class ExpiredOrderWorker {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  async run() {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const expiredOrders = await client.query<{ id: string }>(`
        SELECT id
        FROM orders
        WHERE payment_status = 'pending'
          AND expired_at IS NOT NULL
          AND expired_at < NOW()
      `);

      for (const row of expiredOrders.rows) {
        const orderId = row.id;

        // Update order
        await client.query(
          `
          UPDATE orders
          SET
            status = 'cancelled',
            payment_status = 'expired'
          WHERE id = $1
          `,
          [orderId],
        );

        // Release stock
        await client.query(
          `
          INSERT INTO stock_movements (
            id,
            product_variant_id,
            type,
            quantity,
            reference_id
          )
          SELECT
            gen_random_uuid(),
            oi.variant_id,
            'release',
            oi.quantity,
            oi.order_id
          FROM order_items oi
          WHERE oi.order_id = $1
          `,
          [orderId],
        );

        // Status history
        await client.query(
          `
          INSERT INTO order_status_histories (
            id,
            order_id,
            status,
            note
          )
          VALUES (
            gen_random_uuid(),
            $1,
            'cancelled',
            'Order expired (auto worker)'
          )
          `,
          [orderId],
        );
      }

      await client.query('COMMIT');

      return {
        data: expiredOrders.rows.length,
        message: 'Expired orders processed',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
