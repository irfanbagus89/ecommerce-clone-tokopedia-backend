import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { DevOrderStatusDto } from './dto/dev-order-status.dto';

@Injectable()
export class DevService {
  constructor(@Inject('DATABASE_POOL') private db: Pool) {}

  async setOrderStatus(orderId: string, dto: DevOrderStatusDto) {
    const orderRes = await this.db.query<{
      id: string;
      status: string;
      payment_status: string;
    }>(`SELECT id, status, payment_status FROM orders WHERE id = $1`, [
      orderId,
    ]);
    if (!orderRes.rows[0]) throw new NotFoundException('Order not found');

    if (!dto.order_status && !dto.shipping_status && !dto.payment_status) {
      throw new BadRequestException(
        'At least one of order_status, shipping_status, or payment_status must be provided',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      if (dto.order_status) {
        await client.query(
          `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
          [dto.order_status, orderId],
        );

        const note = dto.note ?? `[DEV] Status forced to '${dto.order_status}'`;
        await client.query(
          `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
          [orderId, dto.order_status, note],
        );
      }

      if (dto.payment_status) {
        await client.query(
          `UPDATE orders SET payment_status = $1, updated_at = NOW() WHERE id = $2`,
          [dto.payment_status, orderId],
        );
        await client.query(
          `UPDATE payments
           SET payment_status = $1,
               paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE paid_at END,
               updated_at = NOW()
           WHERE order_id = $2`,
          [dto.payment_status, orderId],
        );
      }

      if (dto.shipping_status) {
        const sets: string[] = ['status = $1', 'updated_at = NOW()'];
        const params: unknown[] = [dto.shipping_status];

        if (dto.tracking_number) {
          params.push(dto.tracking_number);
          sets.push(`tracking_number = $${params.length}`);
        }

        params.push(orderId);
        await client.query(
          `UPDATE shipping SET ${sets.join(', ')} WHERE order_id = $${params.length}`,
          params,
        );
      }

      await client.query('COMMIT');

      const updatedRes = await this.db.query<{
        id: string;
        status: string;
        payment_status: string;
      }>(
        `SELECT o.id, o.status, o.payment_status,
                sh.status AS shipping_status,
                sh.tracking_number
         FROM orders o
         LEFT JOIN shipping sh ON sh.order_id = o.id
         WHERE o.id = $1`,
        [orderId],
      );

      return {
        message: '[DEV] Order status updated successfully',
        order: updatedRes.rows[0],
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async simulatePayment(orderId: string) {
    const orderRes = await this.db.query<{ id: string; status: string }>(
      `SELECT id, status FROM orders WHERE id = $1`,
      [orderId],
    );
    if (!orderRes.rows[0]) throw new NotFoundException('Order not found');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE orders
         SET payment_status = 'paid', status = 'processing', updated_at = NOW()
         WHERE id = $1`,
        [orderId],
      );
      await client.query(
        `UPDATE payments
         SET payment_status = 'paid', paid_at = NOW(), updated_at = NOW()
         WHERE order_id = $1`,
        [orderId],
      );
      await client.query(
        `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
         VALUES (gen_random_uuid(), $1, 'processing', '[DEV] Payment simulated', NOW())`,
        [orderId],
      );

      await client.query('COMMIT');
      return {
        message: '[DEV] Payment simulated — order is now processing',
        order_id: orderId,
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getOrderSnapshot(orderId: string) {
    const res = await this.db.query<{
      id: string;
      status: string;
      payment_status: string;
      total_price: string;
      invoice_number: string;
    }>(
      `SELECT
         o.id,
         o.status,
         o.payment_status,
         o.total_price,
         o.invoice_number,
         sh.status          AS shipping_status,
         sh.tracking_number AS tracking_number,
         sh.shipping_method AS shipping_method,
         p.payment_status   AS payment_row_status,
         p.payment_type     AS payment_type,
         p.paid_at          AS paid_at
       FROM orders o
       LEFT JOIN shipping sh ON sh.order_id = o.id
       LEFT JOIN payments p  ON p.order_id  = o.id
       WHERE o.id = $1`,
      [orderId],
    );

    if (!res.rows[0]) throw new NotFoundException('Order not found');

    const historyRes = await this.db.query<{
      status: string;
      note: string;
      created_at: Date;
    }>(
      `SELECT status, note, created_at
       FROM order_status_histories
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId],
    );

    return {
      ...res.rows[0],
      history: historyRes.rows,
    };
  }
}
