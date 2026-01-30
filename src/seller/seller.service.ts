import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import {
  CreateProductResponse,
  SellerResponse,
} from './interface/seller-response.interface';
import { RegisterDto } from './dto/register.dto';
import { CreateDto } from './dto/create.dto';
import { ProductsItem } from 'src/products/interface/products.interface';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

interface Seller {
  id: string;
  store_name: string;
  store_description: string;
  verified: boolean;
  user_id: string;
}

@Injectable()
export class SellerService {
  constructor(@Inject('PG_POOL') private db: Pool) {}

  async create(
    data: CreateDto,
    userId: string,
    files: {
      image?: Express.Multer.File[];
      image2?: Express.Multer.File[];
      image3?: Express.Multer.File[];
      image4?: Express.Multer.File[];
      image5?: Express.Multer.File[];
    },
  ): Promise<CreateProductResponse> {
    const seller = await this.db.query<ProductsItem>(
      'SELECT id FROM "sellers" WHERE user_id = $1',
      [userId],
    );

    const uploadsDir = join(process.cwd(), 'uploads');
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir);
    }

    const saveFile = (file?: Express.Multer.File) => {
      if (!file) return null;
      const fileName = `${Date.now()}-${file.originalname}`;
      const filePath = join(uploadsDir, fileName);
      writeFileSync(filePath, file.buffer);
      return fileName;
    };

    const imageUrl1 = saveFile(files.image?.[0]);
    const imageUrl2 = saveFile(files.image2?.[0]);
    const imageUrl3 = saveFile(files.image3?.[0]);
    const imageUrl4 = saveFile(files.image4?.[0]);
    const imageUrl5 = saveFile(files.image5?.[0]);

    const createProduct = await this.db.query<{ id: string; name: string }>(
      `INSERT INTO "products" 
      (category_id, seller_id, name, description, original_price,
       image_url, image_url_2, image_url_3, image_url_4, image_url_5) 
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) 
     RETURNING id, name`,
      [
        data.category_id,
        seller.rows[0].id,
        data.name,
        data.description,
        Number(data.price),
        imageUrl1,
        imageUrl2,
        imageUrl3,
        imageUrl4,
        imageUrl5,
      ],
    );

    const productId = createProduct.rows[0].id;

    // INSERT VARIANTS
    if (data.variants?.length) {
      for (const v of data.variants) {
        await this.db.query(
          `INSERT INTO product_variants
          (product_id, variant_name, additional_price, stock)
         VALUES ($1,$2,$3,$4)`,
          [
            productId,
            v.name,
            Number(v.price), // additional_price
            Number(v.stock),
          ],
        );
      }
    }

    return {
      id: productId,
      name: createProduct.rows[0].name,
    };
  }

  async getMyProductsSeller(
    userId: string,
    page: number,
    limit: number,
    search?: string,
    sortBy: 'name' | 'price' | 'active' = 'name',
    sortOrder: 'asc' | 'desc' = 'asc',
  ): Promise<{
    page: number;
    totalPages: number;
    products: {
      id: string;
      name: string;
      image_url: string;
      price: number | null;
      original_price: number;
      active: boolean;
      variant_id: string;
      stock: number;
      variant_name: string;
      additional_price: number;
    }[];
  }> {
    const offset = (page - 1) * limit;

    const sortMap = {
      name: 'p.name',
      price: 'p.price',
      active: 'p.active',
    };

    const orderBy = sortMap[sortBy] || 'p.name';

    const productsData = await this.db.query<{
      id: string;
      name: string;
      image_url: string;
      price: number | null;
      original_price: number;
      active: boolean;
      variant_id: string;
      stock: number;
      variant_name: string;
      additional_price: number;
    }>(
      `
    SELECT 
      p.id,
      p.name,
      p.original_price, 
      p.price, 
      p.image_url, 
      p.active,
      pv.id AS variant_id,
      pv.stock,
      pv.additional_price, 
      pv.variant_name  
    FROM products p 
    JOIN product_variants pv ON pv.product_id = p.id  
    JOIN sellers s ON s.id = p.seller_id 
    JOIN users u ON u.id = s.user_id 
    WHERE 
      u.id = $1
      AND (
        $2::text IS NULL
        OR LOWER(p.name) LIKE LOWER($2::text)
        OR LOWER(pv.variant_name) LIKE LOWER($2::text)
      )
    ORDER BY ${orderBy} ${sortOrder}
    LIMIT $3 OFFSET $4;
    `,
      [userId, search ? `%${search}%` : null, limit, offset],
    );

    const totalResult = await this.db.query<{ total: number }>(
      `
    SELECT COUNT(*) AS total
    FROM products p 
    JOIN product_variants pv ON pv.product_id = p.id  
    JOIN sellers s ON s.id = p.seller_id 
    JOIN users u ON u.id = s.user_id 
    WHERE 
      u.id = $1
      AND (
        $2::text IS NULL
        OR LOWER(p.name) LIKE LOWER($2::text)
        OR LOWER(pv.variant_name) LIKE LOWER($2::text)
      )
    `,
      [userId, search ? `%${search}%` : null],
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
        price: p.price ? Number(p.price) + Number(p.additional_price) : null,
        original_price: Number(p.original_price) + Number(p.additional_price),
        active: p.active,
        variant_id: p.variant_id,
        stock: p.stock,
        variant_name: p.variant_name,
        additional_price: Number(p.additional_price),
      })),
    };
  }

  async deleteProductVariant(variantId: string, userId: string): Promise<any> {
    const variant = await this.db.query<{
      id: string;
      product_id: string;
      product_seller_id: string;
    }>(
      `
    SELECT 
      pv.id, 
      pv.product_id, 
      p.seller_id AS product_seller_id
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    JOIN sellers s ON s.id = p.seller_id
    JOIN users u ON u.id = s.user_id
    WHERE pv.id = $1 AND u.id = $2
    `,
      [variantId, userId],
    );

    if (variant.rows.length === 0) {
      throw new NotFoundException('Variant tidak ditemukan atau akses ditolak');
    }

    await this.db.query('DELETE FROM product_variants WHERE id = $1', [
      variantId,
    ]);
    if (variant.rows.length === 1) {
      await this.db.query('DELETE FROM products WHERE id = $1', [
        variant.rows[0].product_id,
      ]);
    }
    return { message: 'Variant berhasil dihapus' };
  }

  async registerSeller(data: RegisterDto, id: string): Promise<SellerResponse> {
    const user = await this.db.query<Seller>(
      'SELECT * FROM "sellers" WHERE user_id = $1',
      [id],
    );
    const existingUser = user.rows[0];
    if (existingUser)
      throw new ConflictException('Anda sudah terdaftar sebagai seller');

    const registerStore = await this.db.query<Seller>(
      'INSERT INTO "sellers" (user_id, store_name, store_description) VALUES ($1, $2, $3) RETURNING id, store_name, store_description, verified',
      [id, data.store_name, data.store_description],
    );

    await this.db.query<any>('UPDATE "users" SET role = $1 WHERE id = $2', [
      'seller',
      id,
    ]);

    const result = {
      store: {
        id: registerStore.rows[0].id,
        name: registerStore.rows[0].store_name,
        desc: registerStore.rows[0].store_description,
        verified: registerStore.rows[0].verified,
      },
    };
    return result;
  }

  async getStore(id: string): Promise<SellerResponse> {
    const store = await this.db.query<Seller>(
      'SELECT * from "sellers" WHERE id = $1',
      [id],
    );
    const existingStore = store.rows[0];
    if (!existingStore) throw new NotFoundException('Toko tidak ditemukan');

    const result = {
      store: {
        id: store.rows[0].id,
        name: store.rows[0].store_name,
        desc: store.rows[0].store_description,
        verified: store.rows[0].verified,
      },
    };
    return result;
  }
}
