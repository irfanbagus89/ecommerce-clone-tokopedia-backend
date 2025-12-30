import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { ReviewsResponse } from './interface/reviews.interface';

@Injectable()
export class ReviewsService {
  constructor(@Inject('PG_POOL') private db: Pool) {}

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
}
