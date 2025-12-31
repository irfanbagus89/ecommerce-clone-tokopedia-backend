/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { CreateDto } from './dto/create.dto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  CreateProductResponse,
  ProductDetailResponse,
  ProductsItem,
  ProductsResponse,
} from './interface/products.interface';
import { ConfigService } from 'src/common/config/config.service';

interface Product {
  id: string;
  name: string;
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject('PG_POOL') private db: Pool,
    private configService: ConfigService,
  ) {}

  private calcDiscount(price: number, original: number) {
    return Math.round(((original - price) / original) * 100);
  }

  async create(
    data: CreateDto,
    id: string,
    image?: Express.Multer.File,
  ): Promise<CreateProductResponse> {
    const seller = await this.db.query<ProductsItem>(
      'SELECT id FROM "sellers" WHERE user_id = $1',
      [id],
    );

    let imageUrl: string | null = null;

    if (image) {
      const uploadsDir = join(process.cwd(), 'uploads');

      if (!existsSync(uploadsDir)) {
        mkdirSync(uploadsDir);
      }

      const fileName = `${Date.now()}-${image.originalname}`;
      const filePath = join(uploadsDir, fileName);

      writeFileSync(filePath, image.buffer);

      imageUrl = fileName;
    }
    const createProduct = await this.db.query<Product>(
      `INSERT INTO "products" 
        (category_id, seller_id, name, description, original_price, stock, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, name`,
      [
        data.category_id,
        seller.rows[0].id,
        data.name,
        data.description,
        Number(data.price),
        Number(data.stock),
        imageUrl,
      ],
    );
    const result = {
      id: createProduct.rows[0].id,
      name: createProduct.rows[0].name,
    };
    return result;
  }

  async getProductDetail(id: string): Promise<ProductDetailResponse> {
    const productResult = await this.db.query<ProductsItem>(
      `
    SELECT
      p.id,
      p.name,
      p.description,
      p.price,
      p.original_price,
      p.image_url,
      p.image_url_2,
      p.image_url_3,
      p.image_url_4,
      p.image_url_5,
      s.id AS seller_id,
      s.store_name,
      s.verified,
      s.seller_location,
      st.name AS store_type,
      c.id AS category_id,
      c.name AS category_name,
      c.parent_id AS category_parent_id
    FROM products p
    JOIN sellers s ON s.id = p.seller_id
    LEFT JOIN store_type st ON st.id = s.store_type_id
    JOIN categories c ON c.id = p.category_id
    WHERE p.id = $1
    `,
      [id],
    );
    const product = productResult.rows[0];
    if (!product) {
      throw new NotFoundException('Product tidak ditemukan');
    }
    const variantResult = await this.db.query<{
      id: string;
      name: string;
      price: number;
      stock: number;
    }>(
      `
      SELECT
        pv.id,
        pv.variant_name AS name,
        pv.additional_price AS price,
        pv.stock
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.product_id = $1;
    `,
      [id],
    );
    const ratingResult = await this.db.query<{
      average: number;
      count: number;
    }>(
      `
    SELECT
      ROUND(AVG(rating), 1) AS average,
      COUNT(*) AS count
    FROM reviews
    WHERE product_id = $1
    `,
      [id],
    );
    const soldResult = await this.db.query<{ sold_count: number }>(
      `
    SELECT
      COALESCE(SUM(oi.quantity), 0) AS sold_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = $1
    AND o.status IN ('paid', 'shipped', 'completed')
    `,
      [id],
    );

    const stockResult = await this.db.query<{ total_stock: number }>(
      `
    SELECT COALESCE(SUM(stock), 0) AS total_stock
    FROM product_variants
    WHERE product_id = $1
    `,
      [id],
    );

    return {
      id: product.id,
      name: product.name,
      description: product.description || '',
      price: product.price ? Number(product.price) : null,
      original_price: product.original_price,
      discount_percent: product.price
        ? Math.round(
            ((product.original_price - product.price) /
              product.original_price) *
              100,
          )
        : null,

      rating: {
        average: Number(ratingResult.rows[0]?.average || 0),
        count: Number(ratingResult.rows[0]?.count || 0),
      },
      sold_count: Number(soldResult.rows[0]?.sold_count || 0),
      stock: Number(stockResult.rows[0]?.total_stock || 0),
      images: [
        product.image_url,
        product.image_url_2,
        product.image_url_3,
        product.image_url_4,
        product.image_url_5,
      ].filter((img): img is string => typeof img === 'string'),

      variants: variantResult.rows.map((v) => ({
        id: v.id,
        name: v.name,
        price: Number(v.price),
        stock: Number(v.stock),
      })),

      seller: {
        id: product.seller_id || '',
        store_name: product.store_name || '',
        verified: product.verified || false,
        store_type: product.store_type || '',
        location: product.seller_location || '',
      },

      category: {
        id: product.category_id,
        name: product.category_name || '',
      },
    };
  }

  async getProducts(
    page: number,
    limit: number,
    search: string,
  ): Promise<ProductsResponse> {
    const offset = (page - 1) * limit;
    const searchValue = `%${search}%`;
    const productsData = await this.db.query<ProductsItem>(
      `
      SELECT
      p.id,
      p.name,
      p.price,
      p.original_price,
      p.image_url,
      p.category_id,
      s.seller_location AS location,
      COALESCE(AVG(r.rating), 0) AS rating,
      COALESCE(SUM(oi.quantity), 0) AS sold
    FROM products p
    JOIN sellers s ON s.id = p.seller_id
    JOIN store_type st ON st.id = s.store_type_id
    LEFT JOIN reviews r ON r.product_id = p.id
    LEFT JOIN order_items oi ON oi.product_id = p.id
    WHERE
      EXISTS (
        SELECT 1
        FROM product_variants pv
        WHERE pv.product_id = p.id
          AND pv.stock > 0
      )
      AND (
        $1 = '' OR
        p.name ILIKE $1 OR
        EXISTS (
          SELECT 1
          FROM product_variants pv2
          WHERE pv2.product_id = p.id
          AND pv2.variant_name ILIKE $1
        )
      )
    GROUP BY p.id, s.seller_location
    ORDER BY sold DESC
    LIMIT $2 OFFSET $3
    `,
      [searchValue, limit, offset],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
    SELECT COUNT(DISTINCT p.id) AS total
    FROM products p
    WHERE
      EXISTS (
        SELECT 1
        FROM product_variants pv
        WHERE pv.product_id = p.id
          AND pv.stock > 0
      )
      AND (
        $1 = '' OR
        p.name ILIKE $1 OR
        EXISTS (
          SELECT 1
          FROM product_variants pv2
          WHERE pv2.product_id = p.id
            AND pv2.variant_name ILIKE $1
        )
      );
    `,
      [searchValue],
    );

    const total = Number(totalResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      page: page,
      totalPages: totalPages,
      products: productsData.rows.map((p) => ({
        id: p.id,
        name: p.name,
        category_id: p.category_id,
        image_url: p.image_url,
        price: p.price ? Number(p.price) : null,
        original_price: Number(p.original_price),
        discount: p.price ? this.calcDiscount(p.price, p.original_price) : null,
        rating: Number(p.rating),
        sold: Number(p.sold),
        location: p.location,
      })),
    };
  }

  async getProductOfficial(
    page: number,
    limit: number,
  ): Promise<ProductsResponse> {
    const offset = (page - 1) * limit;

    const productsData = await this.db.query<ProductsItem>(
      `
      SELECT
        p.id,
        p.name,
        p.price,
        p.original_price,
        p.image_url,
        p.category_id,
        s.seller_location AS location,
        COALESCE(AVG(r.rating), 0) AS rating,
        COALESCE(SUM(oi.quantity), 0) AS sold
      FROM products p
      JOIN sellers s ON s.id = p.seller_id
      JOIN store_type st ON st.id = s.store_type_id
      LEFT JOIN reviews r ON r.product_id = p.id
      LEFT JOIN order_items oi ON oi.product_id = p.id
      WHERE
        s.store_type_id = 1
        AND EXISTS (
          SELECT 1
          FROM product_variants pv
          WHERE pv.product_id = p.id
            AND pv.stock > 0
        )
      GROUP BY p.id, s.seller_location
      ORDER BY sold DESC
      LIMIT $1 OFFSET $2;
      `,
      [limit, offset],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM products p
        JOIN sellers s ON s.id = p.seller_id
        WHERE
          s.store_type_id = 1
          AND EXISTS (
            SELECT 1
            FROM product_variants pv
            WHERE pv.product_id = p.id
              AND pv.stock > 0
          );
      `,
    );

    const total = Number(totalResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      totalPages,
      products: productsData.rows.map((p) => ({
        id: p.id,
        name: p.name,
        category_id: p.category_id,
        image_url: p.image_url,
        price: p.price ? Number(p.price) : null,
        original_price: Number(p.original_price),
        discount: p.price ? this.calcDiscount(p.price, p.original_price) : null,
        rating: Number(p.rating),
        sold: Number(p.sold),
        location: p.location,
      })),
    };
  }

  async getForYouProducts(
    page: number,
    limit: number,
  ): Promise<ProductsResponse> {
    const offset = (page - 1) * limit;

    const productsData = await this.db.query<ProductsItem>(
      `SELECT
        p.id,
        p.name,
        p.price,
        p.original_price,
        p.category_id,
        p.image_url,
        s.seller_location AS location,
        COALESCE(AVG(r.rating), 0) AS rating,
        COALESCE(SUM(oi.quantity), 0) AS sold
      FROM products p
      JOIN sellers s ON s.id = p.seller_id
      JOIN store_type st ON st.id = s.store_type_id
      LEFT JOIN reviews r ON r.product_id = p.id
      LEFT JOIN order_items oi ON oi.product_id = p.id
      WHERE
        EXISTS (
          SELECT 1
          FROM product_variants pv
          WHERE pv.product_id = p.id
            AND pv.stock > 0
        )
      GROUP BY p.id, s.seller_location
      ORDER BY sold DESC
      LIMIT $1 OFFSET $2;
      `,
      [limit, offset],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
      SELECT COUNT(*) AS total
      FROM products p
      WHERE
        EXISTS (
          SELECT 1
          FROM product_variants pv
          WHERE pv.product_id = p.id
            AND pv.stock > 0
        );
      `,
    );

    const total = Number(totalResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      totalPages,
      products: productsData.rows.map((p) => ({
        id: p.id,
        name: p.name,
        category_id: p.category_id,
        image_url: p.image_url,
        price: p.price ? Number(p.price) : null,
        original_price: Number(p.original_price),
        discount: p.price ? this.calcDiscount(p.price, p.original_price) : null,
        rating: Number(p.rating),
        sold: Number(p.sold),
        location: p.location,
      })),
    };
  }

  async getPromoProducts(
    page: number,
    limit: number,
  ): Promise<ProductsResponse> {
    const offset = (page - 1) * limit;

    const productsData = await this.db.query<ProductsItem>(
      `
      SELECT
        p.id,
        p.name,
        p.category_id,
        p.price AS original_price,
        p.image_url,
        s.seller_location AS location,
        (p.price - MAX(v.discount_value)) AS price,
        COALESCE(AVG(r.rating), 0) AS rating,
        COALESCE(SUM(oi.quantity), 0) AS sold
      FROM vouchers v
      JOIN products p
        ON p.price >= COALESCE(v.min_purchase, 0)
      JOIN sellers s ON s.id = p.seller_id
      LEFT JOIN reviews r ON r.product_id = p.id
      LEFT JOIN order_items oi ON oi.product_id = p.id
      WHERE
        v.active = true
        AND v.start_date <= CURRENT_DATE
        AND v.end_date >= CURRENT_DATE
        AND EXISTS (
          SELECT 1
          FROM product_variants pv
          WHERE pv.product_id = p.id
            AND pv.stock > 0
        )
      GROUP BY p.id, s.seller_location
      ORDER BY MAX(v.discount_value) DESC
      LIMIT $1 OFFSET $2;
      `,
      [limit, offset],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
      SELECT COUNT(DISTINCT p.id) AS total
      FROM vouchers v
      JOIN products p
        ON p.price >= COALESCE(v.min_purchase, 0)
      WHERE
        v.active = true
        AND v.start_date <= CURRENT_DATE
        AND v.end_date >= CURRENT_DATE
        AND EXISTS (
          SELECT 1
          FROM product_variants pv
          WHERE pv.product_id = p.id
            AND pv.stock > 0
        );
      `,
    );

    const total = Number(totalResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      totalPages,
      products: productsData.rows.map((p) => ({
        id: p.id,
        name: p.name,
        category_id: p.category_id,
        image_url: p.image_url,
        price: p.price ? Number(p.price) : null,
        original_price: Number(p.original_price),
        discount: p.price
          ? this.calcDiscount(p.price, p.original_price ?? 0)
          : null,
        rating: Number(p.rating),
        sold: Number(p.sold),
        location: p.location,
      })),
    };
  }

  async getRecommendationsProductByStore(
    sellerId: string,
    categoryId: string,
    page: number,
    limit: number,
  ): Promise<ProductsResponse> {
    const offset = (page - 1) * limit;

    const productsData = await this.db.query<ProductsItem>(
      `
      SELECT
        p.id,
        p.name,
        p.price,
        p.original_price,
        p.image_url,
        p.category_id,
        s.seller_location AS location,
        COALESCE(AVG(r.rating), 0) AS rating,
        COALESCE(SUM(oi.quantity), 0) AS sold
      FROM products p
      JOIN sellers s ON s.id = p.seller_id
      JOIN store_type st ON st.id = s.store_type_id
      LEFT JOIN reviews r ON r.product_id = p.id
      LEFT JOIN order_items oi ON oi.product_id = p.id
      WHERE
        p.seller_id = $1
        and p.category_id = $2
      GROUP BY p.id, s.seller_location
      ORDER BY sold DESC
      LIMIT $3 OFFSET $4;
      `,
      [sellerId, categoryId, limit, offset],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
        SELECT COUNT(*) AS total
        FROM products p
        JOIN sellers s ON s.id = p.seller_id
        WHERE
          p.seller_id = $1
          and p.category_id = $2
      `,
      [sellerId, categoryId],
    );
    const total = Number(totalResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      totalPages,
      products: productsData.rows.map((p) => ({
        id: p.id,
        name: p.name,
        category_id: p.category_id,
        image_url: p.image_url,
        price: p.price ? Number(p.price) : null,
        original_price: Number(p.original_price),
        discount: p.price ? this.calcDiscount(p.price, p.original_price) : null,
        rating: Number(p.rating),
        sold: Number(p.sold),
        location: p.location,
      })),
    };
  }
}
