import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { CreateVoucherDto } from './dto/voucher.dto';

@Injectable()
export class VouchersService {
  constructor(@Inject('DATABASE_POOL') private db: Pool) {}

  async validateVoucher(code: string, userId: string, totalAmount: number) {
    const res = await this.db.query<{
      id: string;
      code: string;
      type: string;
      value: string;
      min_purchase: string;
      max_discount: string | null;
      usage_limit: number | null;
      used_count: number;
      per_user_limit: number;
      is_active: boolean;
      valid_from: string | null;
      valid_until: string | null;
    }>(`SELECT * FROM vouchers WHERE code = $1 AND is_active = true`, [code]);
    const voucher = res.rows[0];
    if (!voucher) throw new NotFoundException('Voucher not found or inactive');

    const now = new Date();
    if (voucher.valid_from && new Date(voucher.valid_from) > now) {
      throw new BadRequestException('Voucher is not yet valid');
    }
    if (voucher.valid_until && new Date(voucher.valid_until) < now) {
      throw new BadRequestException('Voucher has expired');
    }
    if (Number(voucher.min_purchase) > totalAmount) {
      throw new BadRequestException(
        `Minimum purchase is Rp${voucher.min_purchase}`,
      );
    }
    if (
      voucher.usage_limit !== null &&
      voucher.used_count >= voucher.usage_limit
    ) {
      throw new BadRequestException('Voucher usage limit reached');
    }
    const userUsageRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM orders
       WHERE voucher_id = $1 AND user_id = $2 AND payment_status = 'paid'`,
      [voucher.id, userId],
    );
    if (Number(userUsageRes.rows[0].count) >= voucher.per_user_limit) {
      throw new BadRequestException(
        'You have already used this voucher the maximum number of times',
      );
    }
    let discount = 0;
    if (voucher.type === 'percentage') {
      discount = (totalAmount * Number(voucher.value)) / 100;
      if (voucher.max_discount) {
        discount = Math.min(discount, Number(voucher.max_discount));
      }
    } else if (voucher.type === 'nominal') {
      discount = Number(voucher.value);
    } else if (voucher.type === 'free_shipping') {
      discount = Number(voucher.value);
    }

    return {
      voucher_id: voucher.id,
      code: voucher.code,
      type: voucher.type,
      discount: Math.min(discount, totalAmount),
    };
  }

  async getAvailableVouchers(userId: string, subtotal?: number) {
    const now = new Date().toISOString();

    const res = await this.db.query<{
      id: string;
      code: string;
      type: string;
      value: string;
      min_purchase: string;
      max_discount: string | null;
      usage_limit: number | null;
      used_count: number;
      per_user_limit: number;
      valid_until: string | null;
    }>(
      `SELECT id, code, type, value, min_purchase, max_discount,
              usage_limit, used_count, per_user_limit, valid_until
       FROM vouchers
       WHERE is_active = true
         AND seller_id IS NULL
         AND (valid_from IS NULL OR valid_from <= $1)
         AND (valid_until IS NULL OR valid_until >= $1)
         AND (usage_limit IS NULL OR used_count < usage_limit)
       ORDER BY created_at DESC`,
      [now],
    );

    const results = await Promise.all(
      res.rows.map(async (v) => {
        const userUsage = await this.db.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM orders
           WHERE voucher_id = $1 AND user_id = $2 AND payment_status = 'paid'`,
          [v.id, userId],
        );
        const userUsed = Number(userUsage.rows[0].count);
        if (userUsed >= v.per_user_limit) return null;

        const subtotalNum = subtotal ?? 0;
        const minPurchase = Number(v.min_purchase);
        const eligible = subtotalNum >= minPurchase;
        let estimatedDiscount = 0;
        if (subtotalNum > 0) {
          if (v.type === 'percentage') {
            estimatedDiscount = (subtotalNum * Number(v.value)) / 100;
            if (v.max_discount) {
              estimatedDiscount = Math.min(estimatedDiscount, Number(v.max_discount));
            }
          } else {
            estimatedDiscount = Number(v.value);
          }
          estimatedDiscount = Math.min(estimatedDiscount, subtotalNum);
        }

        return {
          id: v.id,
          code: v.code,
          type: v.type,
          value: Number(v.value),
          min_purchase: Number(v.min_purchase),
          max_discount: v.max_discount ? Number(v.max_discount) : null,
          valid_until: v.valid_until,
          estimated_discount: estimatedDiscount,
          eligible,
        };
      }),
    );

    return results.filter(Boolean);
  }

  async createVoucher(dto: CreateVoucherDto) {
    const d = dto as unknown as {
      code: string;
      type: string;
      value: number;
      min_purchase?: number;
      max_discount?: number;
      usage_limit?: number;
      per_user_limit?: number;
      seller_id?: string;
      valid_from?: string;
      valid_until?: string;
    };
    const {
      code,
      type,
      value,
      min_purchase,
      max_discount,
      usage_limit,
      per_user_limit,
      seller_id,
      valid_from,
      valid_until,
    } = d;
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM vouchers WHERE code = $1`,
      [code],
    );
    if (existing.rows[0]) {
      throw new BadRequestException('Voucher code already exists');
    }

    const result = await this.db.query<{ id: string }>(
      `INSERT INTO vouchers
         (code, type, value, min_purchase, max_discount, usage_limit,
          per_user_limit, seller_id, is_active, valid_from, valid_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        code,
        type,
        value,
        min_purchase ?? 0,
        max_discount ?? null,
        usage_limit ?? null,
        per_user_limit ?? 1,
        seller_id ?? null,
        true,
        valid_from ?? null,
        valid_until ?? null,
      ],
    );

    return { message: 'Voucher created', voucher_id: result.rows[0].id };
  }

  async getVouchers(page: number, limit: number, isActive?: boolean) {
    const offset = (page - 1) * limit;

    const rows = await this.db.query<{
      id: string;
      code: string;
      type: string;
      value: string;
      min_purchase: string;
      max_discount: string | null;
      usage_limit: number | null;
      per_user_limit: number;
      seller_id: string | null;
      is_active: boolean;
      valid_from: string | null;
      valid_until: string | null;
      used_count: number;
      store_name: string | null;
    }>(
      `SELECT v.*, s.store_name
       FROM vouchers v
       LEFT JOIN sellers s ON s.id = v.seller_id
       WHERE ($1::boolean IS NULL OR v.is_active = $1)
       ORDER BY v.created_at DESC
       LIMIT $2 OFFSET $3`,
      [isActive ?? null, limit, offset],
    );

    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM vouchers
       WHERE ($1::boolean IS NULL OR is_active = $1)`,
      [isActive ?? null],
    );

    return {
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      totalPages: Math.ceil(Number(totalRes.rows[0].count) / limit),
      data: rows.rows,
    };
  }

  async toggleVoucher(voucherId: string, isActive: boolean) {
    const res = await this.db.query<{ id: string }>(
      `SELECT id FROM vouchers WHERE id = $1`,
      [voucherId],
    );
    if (!res.rows[0]) throw new NotFoundException('Voucher not found');

    await this.db.query(
      `UPDATE vouchers SET is_active = $1, updated_at = NOW() WHERE id = $2`,
      [isActive, voucherId],
    );

    return { message: `Voucher ${isActive ? 'activated' : 'deactivated'}` };
  }
}
