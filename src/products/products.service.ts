/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { CreateDto } from './dto/create.dto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  CreateProductResponse,
  ParsedQuery,
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
        price: Number(p.price),
        originalPrice: p.original_price ? Number(p.original_price) : null,
        discount: p.original_price
          ? this.calcDiscount(p.price, p.original_price)
          : null,
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
        price: Number(p.price),
        originalPrice: p.original_price ? Number(p.original_price) : null,
        discount: p.original_price
          ? this.calcDiscount(p.price, p.original_price)
          : null,
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
        price: Number(p.price),
        originalPrice: p.original_price ? Number(p.original_price) : null,
        discount: p.original_price
          ? this.calcDiscount(p.price, p.original_price)
          : null,
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
        price: Number(p.price),
        originalPrice: Number(p.original_price),
        discount: this.calcDiscount(p.price, p.original_price ?? 0),
        rating: Number(p.rating),
        sold: Number(p.sold),
        location: p.location,
      })),
    };
  }
}
