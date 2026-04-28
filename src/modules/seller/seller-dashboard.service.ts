import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class SellerDashboardService {
  constructor(@Inject('DATABASE_POOL') private db: Pool) {}

  async getDashboard(userId: string) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const [ordersRes, revenueRes, productsRes, balanceRes] = await Promise.all([
      this.db.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) AS count FROM orders
         WHERE seller_id = $1 GROUP BY status`,
        [sellerId],
      ),
      this.db.query<{ total: string }>(
        `SELECT COALESCE(SUM(seller_earning), 0) AS total
         FROM orders WHERE seller_id = $1 AND payment_status = 'paid'`,
        [sellerId],
      ),
      this.db.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM products WHERE seller_id = $1 AND active = true`,
        [sellerId],
      ),
      this.db.query<{
        available_balance: string;
        pending_balance: string;
        total_earned: string;
      }>(
        `SELECT available_balance, pending_balance, total_earned
         FROM seller_balances WHERE seller_id = $1`,
        [sellerId],
      ),
    ]);

    const orderStats: Record<string, number> = {};
    for (const row of ordersRes.rows) {
      orderStats[row.status] = Number(row.count);
    }

    const balance = balanceRes.rows[0] ?? {
      available_balance: '0',
      pending_balance: '0',
      total_earned: '0',
    };

    return {
      order_stats: orderStats,
      total_revenue: Number(revenueRes.rows[0]?.total ?? 0),
      total_active_products: Number(productsRes.rows[0]?.count ?? 0),
      balance: {
        available: Number(balance.available_balance),
        pending: Number(balance.pending_balance),
        total_earned: Number(balance.total_earned),
      },
    };
  }

  async getBalance(userId: string) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const res = await this.db.query<{
      total_earned: string;
      pending_balance: string;
      available_balance: string;
      withdrawn_total: string;
      updated_at: string;
    }>(
      `SELECT total_earned, pending_balance, available_balance, withdrawn_total, updated_at
       FROM seller_balances WHERE seller_id = $1`,
      [sellerId],
    );

    if (!res.rows[0]) {
      return {
        total_earned: 0,
        pending_balance: 0,
        available_balance: 0,
        withdrawn_total: 0,
      };
    }

    const b = res.rows[0];
    return {
      total_earned: Number(b.total_earned),
      pending_balance: Number(b.pending_balance),
      available_balance: Number(b.available_balance),
      withdrawn_total: Number(b.withdrawn_total),
      updated_at: b.updated_at,
    };
  }

  async requestWithdrawal(
    userId: string,
    amount: number,
    bankName: string,
    accountNumber: string,
    accountName: string,
  ) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const balanceRes = await this.db.query<{ available_balance: string }>(
      `SELECT available_balance FROM seller_balances WHERE seller_id = $1`,
      [sellerId],
    );
    const available = Number(balanceRes.rows[0]?.available_balance ?? 0);
    if (amount > available) {
      throw new NotFoundException(
        `Insufficient balance. Available: Rp${available}`,
      );
    }

    const result = await this.db.query<{ id: string }>(
      `INSERT INTO seller_withdrawals
         (seller_id, amount, bank_name, account_number, account_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [sellerId, amount, bankName, accountNumber, accountName],
    );

    return {
      message: 'Withdrawal request submitted',
      withdrawal_id: result.rows[0].id,
    };
  }

  async getMyWithdrawals(userId: string, page: number, limit: number) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const offset = (page - 1) * limit;
    const rows = await this.db.query<{
      id: string;
      amount: string;
      bank_name: string;
      account_number: string;
      account_name: string;
      status: string;
      note: string | null;
      processed_at: string | null;
      created_at: string;
    }>(
      `SELECT id, amount, bank_name, account_number, account_name, status, note, processed_at, created_at
       FROM seller_withdrawals
       WHERE seller_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [sellerId, limit, offset],
    );

    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM seller_withdrawals WHERE seller_id = $1`,
      [sellerId],
    );

    return {
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      data: rows.rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    };
  }
}
