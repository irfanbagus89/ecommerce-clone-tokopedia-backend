import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import * as midtransClient from 'midtrans-client';
import { randomBytes } from 'crypto';

interface SnapClient {
  createTransaction(
    parameter: Record<string, unknown>,
  ): Promise<{ token: string; redirect_url: string }>;
}

interface SellerGroup {
  items: {
    cart_item_id: string;
    quantity: number;
    seller_id: string;
    product_id: string;
    variant_id: string;
    product_name: string;
    variant_name: string;
    stock: number;
    base_price: string | number;
    additional_price: string | number;
    calculated_price: number;
  }[];
  subtotal: number;
}

@Injectable()
export class OrdersService {
  private snap: SnapClient;

  constructor(@Inject('DATABASE_POOL') private db: Pool) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    this.snap = new (midtransClient as Record<string, any>).Snap({
      isProduction: false,
      serverKey:
        process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-YOUR_SERVER_KEY',
      clientKey:
        process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-YOUR_CLIENT_KEY',
    }) as SnapClient;
  }

  async checkout(
    userId: string,
    cartItemIds: string[],
    address?: string,
    city?: string,
    postalCode?: string,
  ) {
    if (!cartItemIds || cartItemIds.length === 0) {
      throw new BadRequestException('Cart items cannot be empty');
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query<{
        name: string;
        email: string;
        phone: string;
      }>('SELECT name, email, phone FROM users WHERE id = $1', [userId]);
      const user = userRes.rows[0];
      if (!user) throw new BadRequestException('User not found');

      const query = `
        SELECT
          ci.id AS cart_item_id, ci.quantity, ci.seller_id, ci.product_id, ci.variant_id,
          p.name AS product_name, pv.variant_name, pv.stock,
          COALESCE(p.price, p.original_price) AS base_price,
          pv.additional_price
        FROM cart_items ci
        JOIN products p ON p.id = ci.product_id
        JOIN product_variants pv ON pv.id = ci.variant_id
        WHERE ci.id = ANY($1) AND ci.cart_id IN (SELECT id FROM carts WHERE user_id = $2)
      `;
      const cartItemsRes = await client.query<{
        cart_item_id: string;
        quantity: number;
        seller_id: string;
        product_id: string;
        variant_id: string;
        product_name: string;
        variant_name: string;
        stock: number;
        base_price: string | number;
        additional_price: string | number;
      }>(query, [cartItemIds, userId]);
      const items = cartItemsRes.rows;

      if (items.length !== cartItemIds.length) {
        throw new BadRequestException(
          'Some cart items are invalid or do not belong to you',
        );
      }

      const sellersMap = new Map<string, SellerGroup>();
      let totalGrossAmount = 0;

      for (const item of items) {
        if (Number(item.stock) < Number(item.quantity)) {
          throw new BadRequestException(
            `Stock insufficient for product ${item.product_name}`,
          );
        }

        const priceNum =
          Number(item.base_price) + Number(item.additional_price);
        const itemTotal = priceNum * Number(item.quantity);
        const calculatedItem = {
          ...item,
          calculated_price: priceNum,
        };

        if (!sellersMap.has(item.seller_id)) {
          sellersMap.set(item.seller_id, { items: [], subtotal: 0 });
        }
        const sellerGroup = sellersMap.get(item.seller_id)!;
        sellerGroup.items.push(calculatedItem);
        sellerGroup.subtotal += itemTotal;
        totalGrossAmount += itemTotal;
      }

      const timestamp = new Date().getTime();
      const randomSuffix = randomBytes(4).toString('hex');
      const midtransOrderId = `TRX-${timestamp}-${randomSuffix}`;

      const snapParams = {
        transaction_details: {
          order_id: midtransOrderId,
          gross_amount: totalGrossAmount,
        },
        customer_details: {
          first_name: user.name,
          email: user.email,
          phone: user.phone || '08000000000',
        },
      };

      const transaction = await this.snap.createTransaction(snapParams);
      const snapToken = transaction.token;
      const redirectUrl = transaction.redirect_url;

      const invoiceBase = `INV/${new Date().toISOString().slice(0, 10).replace(/-/g, '')}/TRX`;

      for (const [sellerId, group] of sellersMap.entries()) {
        const invoiceNumber = `${invoiceBase}/${sellerId.substring(0, 8).toUpperCase()}/${randomSuffix.toUpperCase()}`;

        const orderRes = await client.query<{ id: string }>(
          `INSERT INTO orders 
            (user_id, seller_id, total_price, status, payment_status, invoice_number, created_at, updated_at)
           VALUES ($1, $2, $3, 'pending', 'unpaid', $4, NOW(), NOW())
           RETURNING id`,
          [userId, sellerId, group.subtotal, invoiceNumber],
        );
        const orderId = orderRes.rows[0].id;

        for (const item of group.items) {
          await client.query(
            `INSERT INTO order_items (order_id, product_id, variant_id, quantity, price)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              orderId,
              item.product_id,
              item.variant_id,
              item.quantity,
              item.calculated_price,
            ],
          );

          await client.query(
            `UPDATE product_variants SET stock = stock - $1 WHERE id = $2`,
            [item.quantity, item.variant_id],
          );
        }

        await client.query(
          `INSERT INTO payments 
            (id, order_id, midtrans_order_id, snap_token, redirect_url, payment_status, gross_amount, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'pending', $5, NOW(), NOW())`,
          [orderId, midtransOrderId, snapToken, redirectUrl, group.subtotal],
        );

        await client.query(
          `INSERT INTO shipping (id, order_id, address, city, postal_code, status, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'pending', NOW(), NOW())`,
          [orderId, address || 'TBD', city || 'TBD', postalCode || 'TBD'],
        );
      }

      await client.query(`DELETE FROM cart_items WHERE id = ANY($1)`, [
        cartItemIds,
      ]);
      await client.query(
        `
        DELETE FROM carts 
        WHERE user_id = $1 AND id NOT IN (SELECT cart_id FROM cart_items)
      `,
        [userId],
      );

      await client.query('COMMIT');

      return {
        message: 'Checkout successful',
        data: {
          token: snapToken,
          redirect_url: redirectUrl,
          midtrans_order_id: midtransOrderId,
        },
      };
    } catch (e: unknown) {
      await client.query('ROLLBACK');
      console.error('Checkout error:', e);
      throw e;
    } finally {
      client.release();
    }
  }

  async handleMidtransWebhook(payload: Record<string, unknown>) {
    const data = payload as unknown as {
      order_id: string;
      transaction_status: string;
      fraud_status?: string;
      payment_type?: string;
      transaction_id?: string;
    };
    if (!data.order_id) return { status: 'ignored', message: 'No order_id' };

    const { order_id, transaction_status, fraud_status } = data;

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      let finalStatus = 'pending';
      let isPaid = false;

      if (transaction_status === 'capture') {
        if (fraud_status === 'challenge') {
          finalStatus = 'challenge';
        } else if (fraud_status === 'accept') {
          finalStatus = 'settlement';
          isPaid = true;
        }
      } else if (transaction_status === 'settlement') {
        finalStatus = 'settlement';
        isPaid = true;
      } else if (
        transaction_status === 'cancel' ||
        transaction_status === 'deny' ||
        transaction_status === 'expire'
      ) {
        finalStatus = transaction_status;
      } else if (transaction_status === 'pending') {
        finalStatus = 'pending';
      }

      const orderPaymentStatus = isPaid
        ? 'paid'
        : finalStatus === 'expire' ||
            finalStatus === 'cancel' ||
            finalStatus === 'deny'
          ? 'cancelled'
          : 'unpaid';
      const orderGeneralStatus = isPaid
        ? 'processing'
        : finalStatus === 'expire' ||
            finalStatus === 'cancel' ||
            finalStatus === 'deny'
          ? 'cancelled'
          : 'pending';

      const paymentsRes = await client.query<{ order_id: string }>(
        `SELECT order_id FROM payments WHERE midtrans_order_id = $1`,
        [order_id],
      );
      const orderIds = paymentsRes.rows.map((r) => r.order_id);

      if (orderIds.length > 0) {
        await client.query(
          `UPDATE payments 
           SET payment_status = $1, payment_type = $2, transaction_id = $3, updated_at = NOW()
           WHERE midtrans_order_id = $4`,
          [
            finalStatus,
            data.payment_type || null,
            data.transaction_id || null,
            order_id,
          ],
        );

        await client.query(
          `UPDATE orders 
           SET payment_status = $1, status = $2, updated_at = NOW() 
           WHERE id = ANY($3)`,
          [orderPaymentStatus, orderGeneralStatus, orderIds],
        );

        if (
          finalStatus === 'expire' ||
          finalStatus === 'cancel' ||
          finalStatus === 'deny'
        ) {
          for (const oid of orderIds) {
            const itemsRes = await client.query<{
              variant_id: string;
              quantity: number;
            }>(
              `SELECT variant_id, quantity FROM order_items WHERE order_id = $1`,
              [oid],
            );
            for (const item of itemsRes.rows) {
              await client.query(
                `UPDATE product_variants SET stock = stock + $1 WHERE id = $2`,
                [item.quantity, item.variant_id],
              );
            }
          }
        }
      }

      await client.query('COMMIT');
      return { status: 'ok', message: 'Webhook processed successfully' };
    } catch (e: unknown) {
      await client.query('ROLLBACK');
      console.error('Webhook error:', e);
      throw e;
    } finally {
      client.release();
    }
  }
}
