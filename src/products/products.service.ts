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

  private flashSaleStatus(progress: number) {
    if (progress >= 90) return 'Segera Habis';
    if (progress >= 70) return 'Hampir Habis';
    if (progress >= 40) return 'Terjual Cepat';
    return 'Promo Berlangsung';
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

  async getProductsWithIntent(
    page: number,
    limit: number,
    parsed: ParsedQuery,
  ): Promise<ProductsResponse> {
    const offset = (page - 1) * limit;

    const conditions: string[] = ['p.stock > 0'];
    const values: any[] = [];
    let i = 1;

    const { product_name, variant_keywords, min_price, max_price } =
      parsed.entities || {};

    // 🔍 Product name (prioritas tinggi)
    if (product_name) {
      conditions.push(`
      (
        p.name ILIKE $${i}
        OR p.description ILIKE $${i}
      )
    `);
      values.push(`%${product_name}%`);
      i++;
    }

    // 🧠 Variant keywords (RAM, storage, dll)
    if (variant_keywords?.length) {
      conditions.push(`
      pv.variant_name ILIKE ANY($${i})
    `);
      values.push(variant_keywords.map((v) => `%${v}%`));
      i++;
    }

    // 💰 Harga minimum
    if (min_price != null) {
      conditions.push(`p.price >= $${i}`);
      values.push(min_price);
      i++;
    }

    // 💰 Harga maksimum
    if (max_price != null) {
      conditions.push(`p.price <= $${i}`);
      values.push(max_price);
      i++;
    }

    const whereClause = conditions.join(' AND ');

    const productsData = await this.db.query<ProductsItem>(
      `
    SELECT
      p.id,
      p.name,
      p.price,
      p.original_price,
      p.image_url,
      st.name AS location,
      COALESCE(AVG(r.rating), 0) AS rating,
      COALESCE(SUM(oi.quantity), 0) AS sold
    FROM products p
    JOIN sellers s ON s.id = p.seller_id
    JOIN store_type st ON st.id = s.store_type_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_variants pv ON pv.product_id = p.id
    LEFT JOIN reviews r ON r.product_id = p.id
    LEFT JOIN order_items oi ON oi.product_id = p.id
    WHERE ${whereClause}
    GROUP BY p.id, st.name
    ORDER BY sold DESC
    LIMIT $${i} OFFSET $${i + 1}
    `,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      [...values, limit, offset],
    );

    return {
      page,
      totalPages: 1,
      products: productsData.rows.map((p) => ({
        id: p.id,
        name: p.name,
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
      st.name AS location,
      COALESCE(AVG(r.rating), 0) AS rating,
      COALESCE(SUM(oi.quantity), 0) AS sold
    FROM products p
    JOIN sellers s ON s.id = p.seller_id
    JOIN store_type st ON st.id = s.store_type_id
    LEFT JOIN reviews r ON r.product_id = p.id
    LEFT JOIN order_items oi ON oi.product_id = p.id
    LEFT JOIN product_variants pv ON pv.product_id = p.id
    WHERE
      p.stock > 0
      AND (
      $1 = '' OR
      p.name ILIKE $1 OR
      pv.variant_name ILIKE $1
    )
    GROUP BY p.id, st.name
    ORDER BY sold DESC
    `,
      [searchValue],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
    SELECT COUNT(DISTINCT p.id) AS total
    FROM products p
    LEFT JOIN product_variants pv ON pv.product_id = p.id
    WHERE
      p.stock > 0
      AND (
        $1 = '' OR
        p.name ILIKE $1 OR
        pv.variant_name ILIKE $1
      )
    `,
      [searchValue],
    );

    const total = Number(totalResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      page: 1,
      totalPages: 1,
      products: productsData.rows.map((p) => ({
        id: p.id,
        name: p.name,
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
        st.name AS location,
        COALESCE(AVG(r.rating), 0) AS rating,
        COALESCE(SUM(oi.quantity), 0) AS sold
      FROM products p
      JOIN sellers s ON s.id = p.seller_id
      JOIN store_type st ON st.id = s.store_type_id
      LEFT JOIN reviews r ON r.product_id = p.id
      LEFT JOIN order_items oi ON oi.product_id = p.id
      WHERE p.stock > 0 AND s.store_type_id = 1
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

    const total = Number(totalResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      totalPages,
      products: productsData.rows.map((p) => ({
        id: p.id,
        name: p.name,
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
      `
      SELECT
        p.id,
        p.name,
        p.price,
        p.original_price,
        p.image_url,
        st.name AS location,
        COALESCE(AVG(r.rating), 0) AS rating,
        COALESCE(SUM(oi.quantity), 0) AS sold,
      FROM products p
      JOIN sellers s ON s.id = p.seller_id
      JOIN store_type st ON st.id = s.store_type_id
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

    const total = Number(totalResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      totalPages,
      products: productsData.rows.map((p) => ({
        id: p.id,
        name: p.name,
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
        p.image_url,
        p.price AS original_price,
        fsi.flash_price AS price,
        fsi.stock,
        fsi.sold
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

    const total = Number(totalResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      totalPages,
      products: productsData.rows.map((p) => {
        const stock = p.stock ?? 0;
        const sold = p.sold ?? 0;
        const totalStock = stock + sold;
        const progress = totalStock ? Math.round((sold / totalStock) * 100) : 0;

        return {
          id: p.id,
          name: p.name,
          image_url: p.image_url,
          price: Number(p.price),
          originalPrice: Number(p.original_price),
          discount: this.calcDiscount(p.price, p.original_price ?? 0),
          flashSale: {
            isActive: true,
            stockProgress: progress,
            statusText: this.flashSaleStatus(progress),
          },
        };
      }),
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
        p.price AS original_price,
        p.image_url,
        (p.price - MAX(v.discount_value)) AS price,
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
      LIMIT $1 OFFSET $2
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

    const total = Number(totalResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      totalPages,
      products: productsData.rows.map((p) => ({
        id: p.id,
        name: p.name,
        image_url: p.image_url,
        price: Number(p.price),
        originalPrice: Number(p.original_price),
        discount: this.calcDiscount(p.price, p.original_price ?? 0),
        rating: Number(p.rating),
        sold: Number(p.sold),
      })),
    };
  }
}
