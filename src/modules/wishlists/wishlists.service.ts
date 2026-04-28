import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class WishlistsService {
  constructor(@Inject('DATABASE_POOL') private db: Pool) {}

  async getWishlists(userId: string, page: number, limit: number) {
    const offset = (page - 1) * limit;

    const rows = await this.db.query<{
      id: string;
      product_id: string;
      name: string;
      image_url: string;
      original_price: number;
      price: number | null;
      active: boolean;
      added_at: string;
    }>(
      `SELECT
         w.id,
         p.id AS product_id,
         p.name,
         p.image_url,
         p.original_price,
         p.price,
         p.active,
         w.created_at AS added_at
       FROM wishlists w
       JOIN products p ON p.id = w.product_id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    const totalRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM wishlists WHERE user_id = $1`,
      [userId],
    );

    return {
      page,
      limit,
      total: Number(totalRes.rows[0].count),
      totalPages: Math.ceil(Number(totalRes.rows[0].count) / limit),
      data: rows.rows.map((r) => ({
        ...r,
        original_price: Number(r.original_price),
        price: r.price ? Number(r.price) : null,
      })),
    };
  }

  async addToWishlist(userId: string, productId: string) {
    const productRes = await this.db.query<{ id: string }>(
      `SELECT id FROM products WHERE id = $1 AND active = true`,
      [productId],
    );
    if (!productRes.rows[0]) throw new NotFoundException('Product not found');

    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2`,
      [userId, productId],
    );
    if (existing.rows[0]) {
      throw new ConflictException('Product already in wishlist');
    }

    await this.db.query(
      `INSERT INTO wishlists (user_id, product_id) VALUES ($1, $2)`,
      [userId, productId],
    );

    return { message: 'Product added to wishlist' };
  }

  async removeFromWishlist(userId: string, productId: string) {
    const res = await this.db.query(
      `DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2`,
      [userId, productId],
    );
    if (res.rowCount === 0) {
      throw new NotFoundException('Product not in wishlist');
    }
    return { message: 'Product removed from wishlist' };
  }

  async checkWishlist(userId: string, productId: string) {
    const res = await this.db.query<{ id: string }>(
      `SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2`,
      [userId, productId],
    );
    return { is_wishlisted: !!res.rows[0] };
  }
}
