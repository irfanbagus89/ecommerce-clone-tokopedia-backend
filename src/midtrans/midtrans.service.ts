import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import axios from 'axios';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { MidtransWebhookDto } from './dto/webhook.dto';
import { ConfigService } from 'src/common/config/config.service';

@Injectable()
export class MidtransService {
  constructor(
    @Inject('PG_POOL') private readonly db: Pool,
    private configService: ConfigService,
  ) {}

  async createPayment(dto: CreatePaymentDto) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const orderRes = await client.query<{
        id: string;
        payment_status: string;
        grand_total: number;
      }>(`SELECT id, payment_status, grand_total FROM orders WHERE id = $1`, [
        dto.orderId,
      ]);

      if (orderRes.rowCount === 0) {
        throw new BadRequestException('Order tidak ditemukan');
      }

      const order = orderRes.rows[0];

      if (order.payment_status !== 'pending') {
        throw new BadRequestException('Order sudah diproses');
      }

      const midtransOrderId = `ORDER-${order.id}-${Date.now()}`;

      const payload = {
        transaction_details: {
          order_id: midtransOrderId,
          gross_amount: order.grand_total,
        },
      };

      const auth = Buffer.from(
        `${this.configService.getMidtransServerKey}:`,
      ).toString('base64');

      const snapRes = await axios.post(
        'https://app.sandbox.midtrans.com/snap/v1/transactions',
        payload,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const { token, redirect_url } = snapRes.data as {
        token: string;
        redirect_url: string;
      };

      const paymentRes = await client.query<{ id: string; order_id: string }>(
        `
        INSERT INTO payments (
          id,
          order_id,
          amount,
          snap_token,
          snap_redirect_url,
          transaction_status,
          midtrans_order_id
        )
        VALUES (
          gen_random_uuid(),
          $1, $2, $3, $4,
          'pending',
          $5
        )
        RETURNING id, order_id
        `,
        [dto.orderId, order.grand_total, token, redirect_url, midtransOrderId],
      );

      await client.query('COMMIT');

      return {
        data: {
          snap_token: token,
          redirect_url,
          payment: paymentRes.rows[0],
        },
        message: 'Snap token berhasil dibuat',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async handleWebhook(payload: MidtransWebhookDto, signatureKey: string) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const {
        order_id: midtransOrderId,
        transaction_status,
        transaction_id,
        payment_type,
        fraud_status,
      } = payload;

      const paymentRes = await client.query<{
        id: string;
        order_id: string;
        transaction_id: string | null;
      }>(
        `SELECT id, order_id, transaction_id FROM payments WHERE midtrans_order_id = $1`,
        [midtransOrderId],
      );

      if (paymentRes.rowCount === 0) {
        throw new BadRequestException('Payment tidak ditemukan');
      }

      const payment = paymentRes.rows[0];

      if (payment.transaction_id && payment.transaction_id === transaction_id) {
        return {
          data: null,
          message: 'Webhook sudah diproses sebelumnya',
        };
      }

      // save hook
      await client.query(
        `
        INSERT INTO payment_notifications (
          id,
          payment_id,
          midtrans_order_id,
          status,
          payload,
          signature_key
        )
        VALUES (
          gen_random_uuid(),
          $1, $2, $3, $4, $5
        )
        `,
        [
          payment.id,
          midtransOrderId,
          transaction_status,
          payload,
          signatureKey,
        ],
      );

      // update payments
      await client.query(
        `
        UPDATE payments
        SET
          transaction_status = $1,
          transaction_id = $2,
          payment_type = $3,
          fraud_status = $4,
          raw_response = $5
        WHERE id = $6
        `,
        [
          transaction_status,
          transaction_id,
          payment_type,
          fraud_status,
          payload,
          payment.id,
        ],
      );

      let orderStatus: string = 'pending';
      let paymentStatus: string = 'pending';

      if (transaction_status === 'settlement') {
        orderStatus = 'processing';
        paymentStatus = 'paid';
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
            'sold',
            oi.quantity,
            oi.order_id
          FROM order_items oi
          WHERE oi.order_id = $1
          `,
          [payment.order_id],
        );
      }

      if (
        transaction_status === 'expire' ||
        transaction_status === 'cancel' ||
        transaction_status === 'deny'
      ) {
        orderStatus = 'cancelled';
        paymentStatus = 'expired';
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
          [payment.order_id],
        );
      }

      if (transaction_status === 'refund') {
        orderStatus = 'refunded';
        paymentStatus = 'refunded';
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
            'refund',
            oi.quantity,
            oi.order_id
          FROM order_items oi
          WHERE oi.order_id = $1
          `,
          [payment.order_id],
        );
      }

      await client.query(
        `
        UPDATE orders
        SET
          status = $1,
          payment_status = $2
        WHERE id = $3
        `,
        [orderStatus, paymentStatus, payment.order_id],
      );

      // status history
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
          $1, $2, $3
        )
        `,
        [payment.order_id, orderStatus, `Midtrans: ${transaction_status}`],
      );

      await client.query('COMMIT');

      return {
        data: null,
        message: 'Webhook berhasil diproses',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
