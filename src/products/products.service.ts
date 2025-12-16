/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { CreateDto } from './dto/create.dto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  CreateProductResponse,
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

  async create(
    data: CreateDto,
    id: string,
    image?: Express.Multer.File,
  ): Promise<CreateProductResponse> {
    const seller = await this.db.query<any>(
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
        (category_id, seller_id, name, description, price, stock, image_url) 
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

  async getProductOfficial(
    page: number,
    limit: number,
  ): Promise<ProductsResponse> {
    const storeTypeId = 1;
    const offset = (page - 1) * limit;

    const productsData = await this.db.query<ProductsItem>(
      `
    SELECT
      p.id,
      p.name,
      p.price,
      p.image_url,
      COALESCE(AVG(r.rating), 0) AS rating,
      COALESCE(SUM(oi.quantity), 0) AS sold
    FROM products p
    JOIN sellers s ON p.seller_id = s.id
    LEFT JOIN reviews r ON r.product_id = p.id
    LEFT JOIN order_items oi ON oi.product_id = p.id
    WHERE s.store_type_id = $1
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
    `,
      [storeTypeId, limit, offset],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
    SELECT COUNT(*) AS total
    FROM products p
    JOIN sellers s ON p.seller_id = s.id
    WHERE s.store_type_id = $1
    `,
      [storeTypeId],
    );

    const total = Number(totalResult.rows[0].total ?? 0);

    const baseUrl =
      this.configService.nodeEnv === 'development'
        ? `http://localhost:${this.configService.port}`
        : this.configService.getDomainProd;

    return {
      page,
      totalPages: Math.ceil(total / limit),
      products: productsData.rows.map((item) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        image_url: item.image_url
          ? `${baseUrl}/uploads/${item.image_url}`
          : null,
        rating: Number(item.rating),
        sold: Number(item.sold),
        store_type: 'Mall',
      })),
    };
  }

  async getFlashSaleProducts(
    page: number,
    limit: number,
  ): Promise<ProductsResponse> {
    const offset = (page - 1) * limit;

    const productsData = await this.db.query<ProductsItem>(
      `
    SELECT
      p.id,
      p.name,
      fsi.flash_price AS price,
      p.image_url,
      fsi.stock,
      fsi.sold,
      fsi.max_per_user
    FROM flash_sales fs
    JOIN flash_sale_items fsi ON fs.id = fsi.flash_sale_id
    JOIN product_variants pv ON pv.id = fsi.product_variant_id
    JOIN products p ON p.id = pv.product_id
    WHERE fs.status = 'active'
      AND fs.start_time <= now()
      AND fs.end_time >= now()
    ORDER BY fs.start_time DESC
    LIMIT $1 OFFSET $2
    `,
      [limit, offset],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
    SELECT COUNT(*) AS total
    FROM flash_sales fs
    JOIN flash_sale_items fsi ON fs.id = fsi.flash_sale_id
    WHERE fs.status = 'active'
      AND fs.start_time <= now()
      AND fs.end_time >= now()
    `,
    );

    const total = Number(totalResult.rows[0].total ?? 0);

    const baseUrl =
      this.configService.nodeEnv === 'development'
        ? `http://localhost:${this.configService.port}`
        : this.configService.getDomainProd;

    return {
      page,
      totalPages: Math.ceil(total / limit),
      products: productsData.rows.map((item) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        image_url: item.image_url
          ? `${baseUrl}/uploads/${item.image_url}`
          : null,
        stock: item.stock,
        sold: item.sold,
        max_per_user: item.max_per_user,
      })),
    };
  }

  async getForYouProducts(
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
      p.image_url,
      st.name AS store_type,
      COALESCE(AVG(r.rating), 0) AS rating,
      COALESCE(SUM(oi.quantity), 0) AS sold
    FROM products p
    JOIN sellers s ON s.id = p.seller_id
    LEFT JOIN store_type st ON st.id = s.store_type_id
    LEFT JOIN reviews r ON r.product_id = p.id
    LEFT JOIN order_items oi ON oi.product_id = p.id
    WHERE p.stock > 0
    GROUP BY p.id, st.name
    ORDER BY sold DESC
    LIMIT $1 OFFSET $2
    `,
      [limit, offset],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
    SELECT COUNT(*) AS total
    FROM products
    WHERE stock > 0
    `,
    );

    const total = Number(totalResult.rows[0].total ?? 0);

    const baseUrl =
      this.configService.nodeEnv === 'development'
        ? `http://localhost:${this.configService.port}`
        : this.configService.getDomainProd;

    return {
      page,
      totalPages: Math.ceil(total / limit),
      products: productsData.rows.map((item) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        image_url: item.image_url
          ? `${baseUrl}/uploads/${item.image_url}`
          : null,
        rating: Number(item.rating),
        sold: Number(item.sold),
        store_type: item.store_type, // Mall / Official
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
        p.price,
        p.image_url,
        COALESCE(AVG(r.rating), 0) AS rating,
        COALESCE(SUM(oi.quantity), 0) AS sold
      FROM vouchers v
      JOIN products p ON p.price >= COALESCE(v.min_purchase, 0)
      LEFT JOIN reviews r ON r.product_id = p.id
      LEFT JOIN order_items oi ON oi.product_id = p.id
      WHERE v.active = true
        AND v.start_date <= CURRENT_DATE
        AND v.end_date >= CURRENT_DATE
      GROUP BY p.id
      ORDER BY MAX(v.discount_value) DESC
      LIMIT $1 OFFSET $2;
    `,
      [limit, offset],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
    SELECT COUNT(DISTINCT p.id) AS total
    FROM vouchers v
    JOIN products p ON p.price >= COALESCE(v.min_purchase, 0)
    WHERE v.active = true
      AND v.start_date <= CURRENT_DATE
      AND v.end_date >= CURRENT_DATE
    `,
    );

    const total = Number(totalResult.rows[0].total ?? 0);

    const baseUrl =
      this.configService.nodeEnv === 'development'
        ? `http://localhost:${this.configService.port}`
        : this.configService.getDomainProd;

    return {
      page,
      totalPages: Math.ceil(total / limit),
      products: productsData.rows.map((item) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        image_url: item.image_url
          ? `${baseUrl}/uploads/${item.image_url}`
          : null,
        rating: Number(item.rating),
        sold: Number(item.sold),
      })),
    };
  }
}
