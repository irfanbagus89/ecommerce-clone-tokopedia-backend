import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Pool } from 'pg';
import { ReviewsResponse } from './interface/reviews.interface';
import { CloudinaryService } from 'src/common';

@Injectable()
export class ReviewsService {
  constructor(
    @Inject('DATABASE_POOL') private db: Pool,
    @Optional() private readonly cloudinary?: CloudinaryService,
  ) {}

  async getReviewsById(
    id: string,
    page: number,
    limit: number,
    sort: string,
    rating: number[] | null,
    withMedia: boolean,
  ): Promise<ReviewsResponse> {
    const offset = (page - 1) * limit;
    const sortMap: Record<string, string> = {
      helpful: 'r.helpful_count DESC',
      newest: 'r.created_at DESC',
      highest: 'r.rating DESC',
      lowest: 'r.rating ASC',
    };
    const sortCase = sortMap[sort] ?? 'r.helpful_count DESC';
    const ratings = rating?.length ? rating : [];

    const reviewStats = await this.db.query<{
      summary_rating: number;
      total_reviews: number;
      total_rating: number;
      satisfaction: number;
    }>(
      `
       SELECT 
        COUNT(*) AS total_reviews,
        SUM(r.rating) AS total_rating,
        SUM(r.rating) * 1.0 / COUNT(*) AS summary_rating,
        (SUM(r.rating) * 100.0 / COUNT(*) / 5) AS satisfaction
      FROM reviews r
      WHERE r.product_id = $1;
        `,
      [id],
    );
    const reviewStatsStars = await this.db.query<{
      stars: [{ star: number; count: number; percent: number }];
    }>(
      `
      SELECT jsonb_agg(
        jsonb_build_object(
          'star', t.star,
          'count', t.count,
          'percent', ROUND(t.percent, 0)
        )
        ORDER BY t.star DESC
      ) AS stars
      FROM (
        SELECT
          s.rating AS star,
          COUNT(r.rating) AS count,
          CASE
            WHEN SUM(COUNT(r.rating)) OVER () = 0 THEN 0
            ELSE COUNT(r.rating) * 100.0 /
                SUM(COUNT(r.rating)) OVER ()
          END AS percent
        FROM generate_series(1,5) s(rating)
        LEFT JOIN reviews r
          ON r.rating = s.rating
        AND r.product_id = $1
        GROUP BY s.rating
      ) t;
        `,
      [id],
    );

    const reviewsList = await this.db.query<{
      id: string;
      user: string;
      avatar: string;
      rating: number;
      date: string;
      variant: string;
      content: string;
      images: string[];
      helpful: number;
    }>(
      `
        SELECT
          r.id,
          u.name AS "user",
          u.avatar,
          r.rating,
          r.created_at AS date,
          pv.variant_name AS variant,
          r.comment AS content,
          r.helpful_count AS helpful,
          COALESCE(
            jsonb_agg(DISTINCT ri.image_url)
              FILTER (WHERE ri.image_url IS NOT NULL),
            '[]'::jsonb
          ) AS images
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN product_variants pv ON pv.id = r.variant_id
        LEFT JOIN review_images ri ON ri.review_id = r.id
        WHERE r.product_id = $1
          AND (
            cardinality($2::int[]) = 0
            OR r.rating = ANY($2::int[])
            )
          AND (
            $3= FALSE
            OR EXISTS (
              SELECT 1
              FROM review_images rim
              WHERE rim.review_id = r.id
            )
          )
        GROUP BY
          r.id, u.name, u.avatar, pv.variant_name
        ORDER BY ${sortCase}
        LIMIT $4
        OFFSET $5
      `,
      [id, ratings, withMedia, limit, offset],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
        SELECT COUNT(DISTINCT r.id) AS total
        FROM reviews r
        LEFT JOIN review_images ri ON ri.review_id = r.id
        WHERE r.product_id = $1
        AND ($2 IS FALSE OR ri.id IS NOT NULL)
        AND (
          cardinality($3::int[]) = 0
          OR r.rating = ANY($3::int[])
          )
      `,
      [id, withMedia, ratings],
    );
    return {
      ratingList: reviewsList.rows.map((r) => ({
        id: r.id,
        user: r.user,
        avatar: r.avatar,
        rating: r.rating,
        date: r.date,
        variant: r.variant,
        content: r.content,
        images: r.images,
        helpful: r.helpful,
      })),

      ratingStats: {
        summaryRating: Number(reviewStats?.rows[0]?.summary_rating ?? 0),
        totalReviews: Number(reviewStats?.rows[0]?.total_reviews ?? 0),
        totalRating: Number(reviewStats?.rows[0]?.total_rating ?? 0),
        satisfaction: Number(reviewStats?.rows[0]?.satisfaction ?? 0),
        stars: reviewStatsStars?.rows[0]?.stars ?? [],
      },

      pagination: {
        page: page,
        limit: limit,
        total: Number(totalResult.rows[0].total),
        totalPages: Math.ceil(totalResult.rows[0].total / limit),
      },
    };
  }

  async createReview(
    userId: string,
    orderId: string,
    productId: string,
    rating: number,
    variantId?: string,
    comment?: string,
  ) {
    const orderRes = await this.db.query<{ status: string; seller_id: string }>(
      `SELECT status FROM orders WHERE id = $1 AND user_id = $2`,
      [orderId, userId],
    );
    const order = orderRes.rows[0];
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'completed') {
      throw new BadRequestException(
        'Reviews can only be submitted for completed orders',
      );
    }
    const itemRes = await this.db.query<{ id: string }>(
      `SELECT id FROM order_items WHERE order_id = $1 AND product_id = $2`,
      [orderId, productId],
    );
    if (!itemRes.rows[0]) {
      throw new BadRequestException('Product not found in this order');
    }
    const existingRes = await this.db.query<{ id: string }>(
      `SELECT r.id FROM reviews r
       JOIN order_items oi ON oi.product_id = r.product_id
       WHERE r.user_id = $1 AND r.product_id = $2 AND oi.order_id = $3`,
      [userId, productId, orderId],
    );
    if (existingRes.rows[0]) {
      throw new ConflictException(
        'You have already reviewed this product for this order',
      );
    }

    const result = await this.db.query<{ id: string }>(
      `INSERT INTO reviews (user_id, product_id, variant_id, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [userId, productId, variantId ?? null, rating, comment ?? null],
    );

    return {
      message: 'Review submitted successfully',
      review_id: result.rows[0].id,
    };
  }

  async uploadReviewImages(
    reviewId: string,
    userId: string,
    files: Express.Multer.File[],
  ) {
    const reviewRes = await this.db.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM reviews WHERE id = $1`,
      [reviewId],
    );
    const review = reviewRes.rows[0];
    if (!review) throw new NotFoundException('Review not found');
    if (review.user_id !== userId)
      throw new ForbiddenException('Access denied');
    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM review_images WHERE review_id = $1`,
      [reviewId],
    );
    const currentCount = parseInt(countRes.rows[0].count, 10);
    if (currentCount + files.length > 5) {
      throw new BadRequestException(
        `Maximum 5 images per review. Currently has ${currentCount}.`,
      );
    }

    const savedUrls: string[] = [];
    const hasPublicIdColumn = await this.hasColumn(
      'review_images',
      'cloudinary_public_id',
    );

    for (const file of files) {
      if (!this.cloudinary) {
        throw new BadRequestException('Cloudinary service is not available');
      }
      const uploaded = await this.cloudinary.uploadImage(
        file,
        'reviews',
        `review-${reviewId}`,
      );
      if (hasPublicIdColumn) {
        await this.db.query(
          `INSERT INTO review_images
             (review_id, image_url, cloudinary_public_id, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [reviewId, uploaded.secure_url, uploaded.public_id],
        );
      } else {
        await this.db.query(
          `INSERT INTO review_images (review_id, image_url, created_at)
           VALUES ($1, $2, NOW())`,
          [reviewId, uploaded.secure_url],
        );
      }
      savedUrls.push(uploaded.secure_url);
    }

    return { message: 'Images uploaded successfully', images: savedUrls };
  }

  async markHelpful(reviewId: string, userId: string) {
    const reviewRes = await this.db.query<{ id: string }>(
      `SELECT id FROM reviews WHERE id = $1`,
      [reviewId],
    );
    if (!reviewRes.rows[0]) throw new NotFoundException('Review not found');
    const voteRes = await this.db.query<{ id: string }>(
      `SELECT id FROM review_helpful_votes WHERE review_id = $1 AND user_id = $2`,
      [reviewId, userId],
    );
    if (voteRes.rows[0]) {
      throw new ConflictException(
        'You have already marked this review as helpful',
      );
    }

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO review_helpful_votes (review_id, user_id, created_at)
         VALUES ($1, $2, NOW())`,
        [reviewId, userId],
      );
      await client.query(
        `UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = $1`,
        [reviewId],
      );
      await client.query('COMMIT');
      return { message: 'Review marked as helpful' };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  private async hasColumn(tableName: string, columnName: string) {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = $2
       )`,
      [tableName, columnName],
    );

    return result.rows[0]?.exists ?? false;
  }
}
