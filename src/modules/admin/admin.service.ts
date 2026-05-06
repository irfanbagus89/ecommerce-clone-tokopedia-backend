import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class AdminService {
  constructor(@Inject('DATABASE_POOL') private db: Pool) {}

  async getDashboard() {
    const [usersRes, sellersRes, ordersRes, revenueRes] = await Promise.all([
      this.db.query<{ count: string }>(`SELECT COUNT(*) AS count FROM users`),
      this.db.query<{ count: string }>(`SELECT COUNT(*) AS count FROM sellers`),
      this.db.query<{ count: string }>(`SELECT COUNT(*) AS count FROM orders`),
      this.db.query<{ total: string }>(
        `SELECT COALESCE(SUM(total_price), 0) AS total
         FROM orders WHERE payment_status = 'paid'`,
      ),
    ]);

    return {
      totalUsers: Number(usersRes.rows[0].count),
      totalSellers: Number(sellersRes.rows[0].count),
      totalOrders: Number(ordersRes.rows[0].count),
      totalRevenue: Number(revenueRes.rows[0].total),
    };
  }

  async getOrders(
    page: number,
    limit: number,
    status?: string,
    search?: string,
  ) {
    const offset = (page - 1) * limit;

    const rows = await this.db.query<{
      id: string;
      invoice_number: string;
      status: string;
      payment_status: string;
      total_price: number;
      created_at: string;
      buyer_name: string;
      seller_name: string;
    }>(
      `SELECT
         o.id,
         o.invoice_number,
         o.status,
         o.payment_status,
         o.total_price,
         o.created_at,
         u.name AS buyer_name,
         s.store_name AS seller_name
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN sellers s ON s.id = o.seller_id
       WHERE ($1::text IS NULL OR o.status = $1)
         AND ($2::text IS NULL
              OR LOWER(u.name) LIKE LOWER('%' || $2 || '%')
              OR LOWER(o.invoice_number) LIKE LOWER('%' || $2 || '%'))
       ORDER BY o.created_at DESC
       LIMIT $3 OFFSET $4`,
      [status ?? null, search ?? null, limit, offset],
    );

    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE ($1::text IS NULL OR o.status = $1)
         AND ($2::text IS NULL OR LOWER(u.name) LIKE LOWER('%' || $2 || '%'))`,
      [status ?? null, search ?? null],
    );

    return {
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      totalPages: Math.ceil(Number(totalRes.rows[0].count) / limit),
      data: rows.rows.map((r) => ({
        ...r,
        total_price: Number(r.total_price),
      })),
    };
  }

  async getSellers(page: number, limit: number, search?: string) {
    const offset = (page - 1) * limit;

    const rows = await this.db.query<{
      id: string;
      store_name: string;
      verified: boolean;
      user_email: string;
      total_products: number;
      created_at: string;
    }>(
      `SELECT
         s.id,
         s.store_name,
         s.verified,
         s.created_at,
         u.email AS user_email,
         (SELECT COUNT(*) FROM products p WHERE p.seller_id = s.id) AS total_products
       FROM sellers s
       JOIN users u ON u.id = s.user_id
       WHERE ($1::text IS NULL
              OR LOWER(s.store_name) LIKE LOWER('%' || $1 || '%')
              OR LOWER(u.email) LIKE LOWER('%' || $1 || '%'))
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [search ?? null, limit, offset],
    );

    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM sellers s
       JOIN users u ON u.id = s.user_id
       WHERE ($1::text IS NULL
              OR LOWER(s.store_name) LIKE LOWER('%' || $1 || '%')
              OR LOWER(u.email) LIKE LOWER('%' || $1 || '%'))`,
      [search ?? null],
    );

    return {
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      totalPages: Math.ceil(Number(totalRes.rows[0].count) / limit),
      data: rows.rows.map((r) => ({
        ...r,
        total_products: Number(r.total_products),
      })),
    };
  }

  async verifySeller(sellerId: string) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE id = $1`,
      [sellerId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');

    await this.db.query(
      `UPDATE sellers SET verified = true, updated_at = NOW() WHERE id = $1`,
      [sellerId],
    );

    return { message: 'Seller verified successfully' };
  }

  async getWithdrawals(page: number, limit: number, status?: string) {
    const offset = (page - 1) * limit;

    const rows = await this.db.query<{
      id: string;
      seller_id: string;
      store_name: string;
      amount: number;
      bank_name: string;
      account_number: string;
      account_name: string;
      status: string;
      created_at: string;
    }>(
      `SELECT
         sw.id,
         sw.seller_id,
         s.store_name,
         sw.amount,
         sw.bank_name,
         sw.account_number,
         sw.account_name,
         sw.status,
         sw.created_at
       FROM seller_withdrawals sw
       JOIN sellers s ON s.id = sw.seller_id
       WHERE ($1::text IS NULL OR sw.status = $1)
       ORDER BY sw.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status ?? null, limit, offset],
    );

    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM seller_withdrawals
       WHERE ($1::text IS NULL OR status = $1)`,
      [status ?? null],
    );

    return {
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      totalPages: Math.ceil(Number(totalRes.rows[0].count) / limit),
      data: rows.rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    };
  }

  async processWithdrawal(
    withdrawalId: string,
    status: 'approved' | 'rejected' | 'paid',
    note?: string,
  ) {
    const wdRes = await this.db.query<{
      id: string;
      status: string;
      seller_id: string;
      amount: string;
    }>(
      `SELECT id, status, seller_id, amount FROM seller_withdrawals WHERE id = $1`,
      [withdrawalId],
    );
    const wd = wdRes.rows[0];
    if (!wd) throw new NotFoundException('Withdrawal not found');
    if (wd.status !== 'pending') {
      throw new BadRequestException(
        'Only pending withdrawals can be processed',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE seller_withdrawals
         SET status = $1, note = $2, processed_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [status, note ?? null, withdrawalId],
      );

      if (status === 'approved' || status === 'paid') {
        await client.query(
          `UPDATE seller_balances
           SET available_balance = available_balance - $1,
               withdrawn_total = withdrawn_total + $1,
               updated_at = NOW()
           WHERE seller_id = $2`,
          [wd.amount, wd.seller_id],
        );
      }

      await client.query('COMMIT');
      return { message: `Withdrawal ${status} successfully` };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getUsers(page: number, limit: number, search?: string, role?: string) {
    const offset = (page - 1) * limit;

    const rows = await this.db.query<{
      id: string;
      name: string;
      email: string;
      role: string;
      created_at: string;
    }>(
      `SELECT id, name, email, role, created_at FROM users
       WHERE ($1::text IS NULL OR LOWER(name) LIKE LOWER('%' || $1 || '%') OR LOWER(email) LIKE LOWER('%' || $1 || '%'))
         AND ($2::text IS NULL OR role = $2)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [search ?? null, role ?? null, limit, offset],
    );

    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM users
       WHERE ($1::text IS NULL OR LOWER(name) LIKE LOWER('%' || $1 || '%') OR LOWER(email) LIKE LOWER('%' || $1 || '%'))
         AND ($2::text IS NULL OR role = $2)`,
      [search ?? null, role ?? null],
    );

    return {
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      totalPages: Math.ceil(Number(totalRes.rows[0].count) / limit),
      data: rows.rows,
    };
  }

  async refundOrder(orderId: string) {
    const orderRes = await this.db.query<{
      id: string;
      status: string;
      seller_id: string;
      seller_earning: string;
    }>(
      `SELECT id, status, seller_id, seller_earning FROM orders WHERE id = $1`,
      [orderId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');
    if (!['paid', 'delivered', 'completed'].includes(order.status)) {
      throw new BadRequestException('Order cannot be refunded at this stage');
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE orders
         SET status = 'refunded', payment_status = 'refunded', updated_at = NOW()
         WHERE id = $1`,
        [orderId],
      );
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
      if (order.seller_earning) {
        await client.query(
          `UPDATE seller_balances
           SET available_balance = available_balance - $1,
               total_earned = total_earned - $1,
               updated_at = NOW()
           WHERE seller_id = $2`,
          [order.seller_earning, order.seller_id],
        );
      }

      await client.query(
        `INSERT INTO order_status_histories (id, order_id, status, note, created_at)
         VALUES (gen_random_uuid(), $1, 'refunded', 'Admin processed refund', NOW())`,
        [orderId],
      );

      await client.query('COMMIT');
      return { message: 'Order refunded successfully' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getSellerBalance(sellerId: string) {
    const res = await this.db.query<{
      seller_id: string;
      store_name: string;
      total_earned: string;
      pending_balance: string;
      available_balance: string;
      withdrawn_total: string;
    }>(
      `SELECT
         sb.seller_id,
         s.store_name,
         sb.total_earned,
         sb.pending_balance,
         sb.available_balance,
         sb.withdrawn_total
       FROM seller_balances sb
       JOIN sellers s ON s.id = sb.seller_id
       WHERE sb.seller_id = $1`,
      [sellerId],
    );
    if (!res.rows[0]) throw new NotFoundException('Seller balance not found');

    const b = res.rows[0];
    return {
      seller_id: b.seller_id,
      store_name: b.store_name,
      total_earned: Number(b.total_earned),
      pending_balance: Number(b.pending_balance),
      available_balance: Number(b.available_balance),
      withdrawn_total: Number(b.withdrawn_total),
    };
  }
}
