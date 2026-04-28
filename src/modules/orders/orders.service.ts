import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import * as midtransClient from 'midtrans-client';
import { randomBytes, createHash } from 'crypto';

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.snap = new (midtransClient as Record<string, any>).Snap({
      isProduction: process.env.MIDTRANS_ENV === 'production',
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

        const platformFee = group.subtotal * 0.01;
        const sellerEarning = group.subtotal - platformFee;

        const orderRes = await client.query<{ id: string }>(
          `INSERT INTO orders 
            (user_id, seller_id, total_price, status, payment_status, invoice_number, created_at, updated_at, platform_fee, seller_earning)
           VALUES ($1, $2, $3, 'pending', 'unpaid', $4, NOW(), NOW(), $5, $6)
           RETURNING id`,
          [
            userId,
            sellerId,
            group.subtotal,
            invoiceNumber,
            platformFee,
            sellerEarning,
          ],
        );
        const orderId = orderRes.rows[0].id;

        await client.query(
          `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
           VALUES (gen_random_uuid(), $1, 'pending', 'Order created', NOW())`,
          [orderId],
        );

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

          const stockUpdateRes = await client.query(
            `UPDATE product_variants SET stock = stock - $1 WHERE id = $2 AND stock >= $1`,
            [item.quantity, item.variant_id],
          );
          if (stockUpdateRes.rowCount === 0) {
            throw new BadRequestException(
              `Stock insufficient or race condition detected for product ${item.product_name}`,
            );
          }
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

  async getMyOrders(
    userId: string,
    status: string | undefined,
    page: number,
    limit: number,
  ) {
    const offset = (page - 1) * limit;
    const params: unknown[] = [userId, limit, offset];
    let statusClause = '';

    if (status) {
      params.push(status);
      statusClause = `AND o.status = $${params.length}`;
    }

    const sql = `
      SELECT
        o.id,
        o.invoice_number,
        o.status,
        o.payment_status,
        o.total_price,
        o.created_at,
        s.store_name,
        s.id AS seller_id,
        (
          SELECT json_agg(json_build_object(
            'product_name', p.name,
            'variant_name', pv.variant_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'image_url', p.image_url
          ))
          FROM order_items oi
          JOIN products p ON p.id = oi.product_id
          LEFT JOIN product_variants pv ON pv.id = oi.variant_id
          WHERE oi.order_id = o.id
        ) AS items
      FROM orders o
      JOIN sellers s ON s.id = o.seller_id
      WHERE o.user_id = $1 ${statusClause}
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countSql = `
      SELECT COUNT(*) AS total FROM orders o
      WHERE o.user_id = $1 ${status ? 'AND o.status = $2' : ''}
    `;
    const countParams = status ? [userId, status] : [userId];

    const [ordersRes, countRes] = await Promise.all([
      this.db.query<{
        id: string;
        invoice_number: string;
        status: string;
        payment_status: string;
        total_price: string;
        created_at: Date;
        store_name: string;
        seller_id: string;
        items: unknown;
      }>(sql, params),
      this.db.query<{ total: string }>(countSql, countParams),
    ]);

    const total = parseInt(countRes.rows[0].total, 10);

    return {
      data: ordersRes.rows,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getOrderDetail(orderId: string, userId: string) {
    const orderRes = await this.db.query<{
      id: string;
      invoice_number: string;
      status: string;
      payment_status: string;
      total_price: string;
      shipping_cost: string;
      discount_amount: string;
      seller_earning: string;
      platform_fee: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, invoice_number, status, payment_status, total_price,
              shipping_cost, discount_amount, seller_earning, platform_fee,
              created_at, updated_at
       FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');

    const [itemsRes, paymentRes, shippingRes, sellerRes] = await Promise.all([
      this.db.query<{
        id: string;
        product_id: string;
        product_name: string;
        image_url: string;
        variant_id: string;
        variant_name: string;
        quantity: number;
        price: string;
      }>(
        `SELECT oi.id, oi.product_id, p.name AS product_name, p.image_url,
                oi.variant_id, pv.variant_name, oi.quantity, oi.price
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         LEFT JOIN product_variants pv ON pv.id = oi.variant_id
         WHERE oi.order_id = $1`,
        [orderId],
      ),
      this.db.query<{
        payment_status: string;
        payment_type: string;
        snap_token: string;
        redirect_url: string;
        gross_amount: string;
        paid_at: Date;
      }>(
        `SELECT payment_status, payment_type, snap_token, redirect_url,
                gross_amount, paid_at
         FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [orderId],
      ),
      this.db.query<{
        address: string;
        city: string;
        postal_code: string;
        shipping_method: string;
        tracking_number: string;
        status: string;
        estimated_delivery: string;
      }>(
        `SELECT address, city, postal_code, shipping_method, tracking_number,
                status, estimated_delivery
         FROM shipping WHERE order_id = $1`,
        [orderId],
      ),
      this.db.query<{ store_name: string; id: string }>(
        `SELECT s.store_name, s.id
         FROM orders o JOIN sellers s ON s.id = o.seller_id
         WHERE o.id = $1`,
        [orderId],
      ),
    ]);

    return {
      ...order,
      seller: sellerRes.rows[0] ?? null,
      items: itemsRes.rows,
      payment: paymentRes.rows[0] ?? null,
      shipping: shippingRes.rows[0] ?? null,
    };
  }

  async confirmOrderReceived(orderId: string, userId: string) {
    const orderRes = await this.db.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'shipped') {
      throw new BadRequestException(
        'Order can only be confirmed when status is "shipped"',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
        [orderId],
      );
      await client.query(
        `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
         VALUES (gen_random_uuid(), $1, 'delivered', 'Buyer confirmed receipt', NOW())`,
        [orderId],
      );
      await client.query('COMMIT');
      return { message: 'Order confirmed as delivered' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async cancelOrder(orderId: string, userId: string) {
    const orderRes = await this.db.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'pending') {
      throw new BadRequestException(
        'Order can only be cancelled when status is "pending"',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Restore stock
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

      await client.query(
        `UPDATE orders
         SET status = 'cancelled', payment_status = 'cancelled', updated_at = NOW()
         WHERE id = $1`,
        [orderId],
      );
      await client.query(
        `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
         VALUES (gen_random_uuid(), $1, 'cancelled', 'Cancelled by buyer', NOW())`,
        [orderId],
      );
      await client.query('COMMIT');
      return { message: 'Order cancelled successfully' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getSellerOrders(
    userId: string,
    status: string | undefined,
    page: number,
    limit: number,
  ) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const offset = (page - 1) * limit;
    const params: unknown[] = [sellerId, limit, offset];
    let statusClause = '';

    if (status) {
      params.push(status);
      statusClause = `AND o.status = $${params.length}`;
    }

    const sql = `
      SELECT
        o.id,
        o.invoice_number,
        o.status,
        o.payment_status,
        o.total_price,
        o.created_at,
        u.name AS buyer_name,
        u.email AS buyer_email,
        (
          SELECT json_agg(json_build_object(
            'product_name', p.name,
            'variant_name', pv.variant_name,
            'quantity', oi.quantity,
            'price', oi.price,
            'image_url', p.image_url
          ))
          FROM order_items oi
          JOIN products p ON p.id = oi.product_id
          LEFT JOIN product_variants pv ON pv.id = oi.variant_id
          WHERE oi.order_id = o.id
        ) AS items
      FROM orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.seller_id = $1 ${statusClause}
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countSql = `
      SELECT COUNT(*) AS total FROM orders o
      WHERE o.seller_id = $1 ${status ? 'AND o.status = $2' : ''}
    `;
    const countParams = status ? [sellerId, status] : [sellerId];

    const [ordersRes, countRes] = await Promise.all([
      this.db.query<{
        id: string;
        invoice_number: string;
        status: string;
        payment_status: string;
        total_price: string;
        created_at: Date;
        buyer_name: string;
        buyer_email: string;
        items: unknown;
      }>(sql, params),
      this.db.query<{ total: string }>(countSql, countParams),
    ]);

    const total = parseInt(countRes.rows[0].total, 10);

    return {
      data: ordersRes.rows,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async acceptOrder(orderId: string, userId: string) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const orderRes = await this.db.query<{
      status: string;
      payment_status: string;
    }>(
      `SELECT status, payment_status FROM orders WHERE id = $1 AND seller_id = $2`,
      [orderId, sellerId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');
    if (order.payment_status !== 'paid') {
      throw new BadRequestException('Order has not been paid yet');
    }
    if (order.status !== 'pending' && order.status !== 'processing') {
      throw new BadRequestException(
        'Order cannot be accepted in its current status',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE orders SET status = 'processing', updated_at = NOW() WHERE id = $1`,
        [orderId],
      );
      await client.query(
        `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
         VALUES (gen_random_uuid(), $1, 'processing', 'Order accepted by seller', NOW())`,
        [orderId],
      );
      await client.query('COMMIT');
      return { message: 'Order accepted and is now processing' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async shipOrder(
    orderId: string,
    userId: string,
    trackingNumber: string,
    shippingMethod?: string,
  ) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const orderRes = await this.db.query<{ status: string }>(
      `SELECT status FROM orders WHERE id = $1 AND seller_id = $2`,
      [orderId, sellerId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'processing') {
      throw new BadRequestException(
        'Order must be in "processing" status to be shipped',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE orders SET status = 'shipped', updated_at = NOW() WHERE id = $1`,
        [orderId],
      );
      await client.query(
        `UPDATE shipping
         SET tracking_number = $1,
             shipping_method = COALESCE($2, shipping_method),
             status = 'shipped',
             updated_at = NOW()
         WHERE order_id = $3`,
        [trackingNumber, shippingMethod ?? null, orderId],
      );
      await client.query(
        `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
         VALUES (gen_random_uuid(), $1, 'shipped', $2, NOW())`,
        [orderId, `Shipped with tracking number: ${trackingNumber}`],
      );
      await client.query('COMMIT');
      return {
        message: 'Order marked as shipped',
        tracking_number: trackingNumber,
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getOrderHistory(orderId: string, userId: string) {
    // Allow both buyer and seller to view — verify ownership first
    const orderRes = await this.db.query<{
      user_id: string;
      seller_id: string;
    }>(
      `SELECT o.user_id, s.user_id AS seller_user_id
       FROM orders o
       JOIN sellers s ON s.id = o.seller_id
       WHERE o.id = $1`,
      [orderId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');

    // Accept row if columns match either buyer or seller
    const raw = orderRes.rows[0] as unknown as {
      user_id: string;
      seller_user_id: string;
    };
    if (raw.user_id !== userId && raw.seller_user_id !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const historyRes = await this.db.query<{
      id: string;
      status: string;
      note: string;
      created_at: Date;
    }>(
      `SELECT id, status, note, created_at
       FROM order_status_histories
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId],
    );

    return { order_id: orderId, history: historyRes.rows };
  }

  async handleMidtransWebhook(payload: Record<string, unknown>) {
    const data = payload as unknown as {
      order_id: string;
      transaction_status: string;
      fraud_status?: string;
      payment_type?: string;
      transaction_id?: string;
      status_code?: string;
      gross_amount?: string;
      signature_key?: string;
    };
    if (!data.order_id) return { status: 'ignored', message: 'No order_id' };

    const serverKey =
      process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-YOUR_SERVER_KEY';
    if (data.status_code && data.gross_amount && data.signature_key) {
      const hash = createHash('sha512');
      hash.update(
        `${data.order_id}${data.status_code}${data.gross_amount}${serverKey}`,
      );
      const expectedSignature = hash.digest('hex');

      if (expectedSignature !== data.signature_key) {
        throw new BadRequestException(
          'Invalid signature key: Webhook spoofing detected!',
        );
      }
    } else {
      if (process.env.MIDTRANS_ENV === 'production') {
        throw new BadRequestException('Missing signature components');
      }
    }

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

        for (const oid of orderIds) {
          await client.query(
            `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
               VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
            [
              oid,
              orderGeneralStatus,
              `Payment status updated to ${orderPaymentStatus}`,
            ],
          );
        }

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
