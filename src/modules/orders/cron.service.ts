import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Pool } from 'pg';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(@Inject('DATABASE_POOL') private db: Pool) {}

  @Cron(CronExpression.EVERY_HOUR)
  async autoCancelExpiredOrders() {
    this.logger.log('Running: autoCancelExpiredOrders');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Ambil order pending yang sudah > 24 jam
      const expiredRes = await client.query<{ id: string }>(
        `SELECT o.id FROM orders o
         WHERE o.status = 'pending'
           AND o.payment_status = 'unpaid'
           AND o.created_at < NOW() - INTERVAL '24 hours'`,
      );
      const orderIds = expiredRes.rows.map((r) => r.id);

      for (const orderId of orderIds) {
        // Restore stok
        const itemsRes = await client.query<{
          variant_id: string;
          quantity: number;
        }>(`SELECT variant_id, quantity FROM order_items WHERE order_id = $1`, [
          orderId,
        ]);
        for (const item of itemsRes.rows) {
          await client.query(
            `UPDATE product_variants SET stock = stock + $1 WHERE id = $2`,
            [item.quantity, item.variant_id],
          );
        }

        // Update status order & payment
        await client.query(
          `UPDATE orders
           SET status = 'cancelled', payment_status = 'expired', updated_at = NOW()
           WHERE id = $1`,
          [orderId],
        );

        // Update payments
        await client.query(
          `UPDATE payments SET payment_status = 'expired', updated_at = NOW()
           WHERE order_id = $1 AND payment_status = 'pending'`,
          [orderId],
        );

        // Catat histori
        await client.query(
          `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
           VALUES (gen_random_uuid(), $1, 'cancelled', 'Auto-cancelled: payment expired after 24 hours', NOW())`,
          [orderId],
        );
      }

      await client.query('COMMIT');
      if (orderIds.length > 0) {
        this.logger.log(`Auto-cancelled ${orderIds.length} expired orders`);
      }
    } catch (e) {
      await client.query('ROLLBACK');
      this.logger.error('autoCancelExpiredOrders failed', e);
    } finally {
      client.release();
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoCompleteDeliveredOrders() {
    this.logger.log('Running: autoCompleteDeliveredOrders');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const deliveredRes = await client.query<{
        id: string;
        seller_id: string;
        seller_earning: string;
      }>(
        `SELECT o.id, o.seller_id, o.seller_earning
         FROM orders o
         WHERE o.status = 'delivered'
           AND o.updated_at < NOW() - INTERVAL '7 days'`,
      );
      const orders = deliveredRes.rows;

      for (const order of orders) {
        // Update status ke completed
        await client.query(
          `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1`,
          [order.id],
        );

        // Catat histori
        await client.query(
          `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
           VALUES (gen_random_uuid(), $1, 'completed', 'Auto-completed: 7 days after delivery', NOW())`,
          [order.id],
        );

        // Kredit saldo seller jika ada seller_earning
        if (order.seller_earning) {
          await client.query(
            `INSERT INTO seller_balances (seller_id, total_earned, available_balance, updated_at)
             VALUES ($1, $2, $2, NOW())
             ON CONFLICT (seller_id) DO UPDATE
             SET total_earned = seller_balances.total_earned + $2,
                 available_balance = seller_balances.available_balance + $2,
                 updated_at = NOW()`,
            [order.seller_id, order.seller_earning],
          );
        }
      }

      await client.query('COMMIT');
      if (orders.length > 0) {
        this.logger.log(`Auto-completed ${orders.length} delivered orders`);
      }
    } catch (e) {
      await client.query('ROLLBACK');
      this.logger.error('autoCompleteDeliveredOrders failed', e);
    } finally {
      client.release();
    }
  }
}
