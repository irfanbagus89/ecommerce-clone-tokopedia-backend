import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Pool } from 'pg';
import {
  CreateProductResponse,
  SellerResponse,
} from './interface/seller-response.interface';
import { RegisterDto } from './dto/register.dto';
import { CreateDto } from './dto/create.dto';
import {
  UpdateProductDto,
  UpdateSellerProfileDto,
  UpdateStockDto,
} from './dto/update.dto';
import { CloudinaryService } from 'src/common';

@Injectable()
export class SellerService {
  constructor(
    @Inject('DATABASE_POOL') private db: Pool,
    @Optional() private readonly cloudinary?: CloudinaryService,
  ) {}

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
    const seller = await this.db.query<{ id: string }>(
      'SELECT id FROM "sellers" WHERE user_id = $1',
      [userId],
    );

    if (!seller.rows[0]) throw new NotFoundException('Seller not found');

    const uploadedImages = await this.uploadProductImages(files);
    const imageUrl1 = uploadedImages[0]?.secure_url ?? null;
    const imageUrl2 = uploadedImages[1]?.secure_url ?? null;
    const imageUrl3 = uploadedImages[2]?.secure_url ?? null;
    const imageUrl4 = uploadedImages[3]?.secure_url ?? null;
    const imageUrl5 = uploadedImages[4]?.secure_url ?? null;

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
    await this.insertProductImages(
      productId,
      uploadedImages.filter((image): image is NonNullable<typeof image> => {
        return image !== null;
      }),
    );

    if (data.variants?.length) {
      for (const v of data.variants) {
        await this.db.query(
          `INSERT INTO product_variants
          (product_id, variant_name, additional_price, stock)
         VALUES ($1,$2,$3,$4)`,
          [productId, v.name, Number(v.price), Number(v.stock)],
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

  async deleteProductVariant(variantId: string, userId: string) {
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
    const user = await this.db.query<{
      id: string;
      store_name: string;
      store_description: string;
      verified: boolean;
      user_id: string;
    }>('SELECT * FROM "sellers" WHERE user_id = $1', [id]);
    const existingUser = user.rows[0];
    if (existingUser)
      throw new ConflictException('Anda sudah terdaftar sebagai seller');

    const registerStore = await this.db.query<{
      id: string;
      store_name: string;
      store_description: string;
      verified: boolean;
      user_id: string;
    }>(
      'INSERT INTO "sellers" (user_id, store_name, store_description) VALUES ($1, $2, $3) RETURNING id, store_name, store_description, verified',
      [id, data.store_name, data.store_description],
    );

    await this.db.query('UPDATE "users" SET role = $1 WHERE id = $2', [
      'seller',
      id,
    ]);

    return {
      store: {
        id: registerStore.rows[0].id,
        name: registerStore.rows[0].store_name,
        desc: registerStore.rows[0].store_description,
        verified: registerStore.rows[0].verified,
      },
    };
  }

  async getStore(id: string): Promise<SellerResponse> {
    const store = await this.db.query<{
      id: string;
      store_name: string;
      store_description: string;
      verified: boolean;
      user_id: string;
    }>('SELECT * from "sellers" WHERE id = $1', [id]);
    const existingStore = store.rows[0];
    if (!existingStore) throw new NotFoundException('Toko tidak ditemukan');

    return {
      store: {
        id: store.rows[0].id,
        name: store.rows[0].store_name,
        desc: store.rows[0].store_description,
        verified: store.rows[0].verified,
      },
    };
  }

  async getProfile(user_id: string): Promise<{
    id: string;
    name: string;
    desc: string;
    verified: boolean;
    seller_location: string;
  }> {
    const store = await this.db.query<{
      id: string;
      store_name: string;
      store_description: string;
      verified: boolean;
      seller_location: string;
    }>(
      `SELECT s.id, s.store_name, s.store_description, s.verified, s.seller_location
       FROM "sellers" s WHERE user_id = $1`,
      [user_id],
    );
    const existingStore = store.rows[0];
    if (!existingStore) throw new NotFoundException('Toko tidak ditemukan');

    return {
      id: existingStore.id,
      name: existingStore.store_name,
      desc: existingStore.store_description,
      verified: existingStore.verified,
      seller_location: existingStore.seller_location,
    };
  }

  async updateProduct(
    productId: string,
    userId: string,
    dto: UpdateProductDto,
    files: {
      image?: Express.Multer.File[];
      image2?: Express.Multer.File[];
      image3?: Express.Multer.File[];
      image4?: Express.Multer.File[];
      image5?: Express.Multer.File[];
    },
  ) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const productRes = await this.db.query<{ id: string }>(
      `SELECT id FROM products WHERE id = $1 AND seller_id = $2`,
      [productId, sellerId],
    );
    if (!productRes.rows[0]) throw new NotFoundException('Product not found');

    const setParts: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) {
      setParts.push(`name = $${idx++}`);
      params.push(dto.name);
    }
    if (dto.description !== undefined) {
      setParts.push(`description = $${idx++}`);
      params.push(dto.description);
    }
    if (dto.price !== undefined) {
      setParts.push(`original_price = $${idx++}`);
      params.push(dto.price);
    }
    if (dto.category_id !== undefined) {
      setParts.push(`category_id = $${idx++}`);
      params.push(dto.category_id);
    }

    const uploadedImages = await this.uploadProductImages(files);
    const img1 = uploadedImages[0]?.secure_url;
    const img2 = uploadedImages[1]?.secure_url;
    const img3 = uploadedImages[2]?.secure_url;
    const img4 = uploadedImages[3]?.secure_url;
    const img5 = uploadedImages[4]?.secure_url;

    if (img1) {
      setParts.push(`image_url = $${idx++}`);
      params.push(img1);
    }
    if (img2) {
      setParts.push(`image_url_2 = $${idx++}`);
      params.push(img2);
    }
    if (img3) {
      setParts.push(`image_url_3 = $${idx++}`);
      params.push(img3);
    }
    if (img4) {
      setParts.push(`image_url_4 = $${idx++}`);
      params.push(img4);
    }
    if (img5) {
      setParts.push(`image_url_5 = $${idx++}`);
      params.push(img5);
    }

    if (setParts.length === 0)
      throw new BadRequestException('No fields to update');

    setParts.push(`updated_at = NOW()`);
    params.push(productId);

    await this.db.query(
      `UPDATE products SET ${setParts.join(', ')} WHERE id = $${idx}`,
      params,
    );
    await this.insertProductImages(
      productId,
      uploadedImages.filter((image): image is NonNullable<typeof image> => {
        return image !== null;
      }),
    );

    return { message: 'Product updated successfully' };
  }

  async deleteProduct(productId: string, userId: string) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const productRes = await this.db.query<{ id: string; active: boolean }>(
      `SELECT id, active FROM products WHERE id = $1 AND seller_id = $2`,
      [productId, sellerId],
    );
    if (!productRes.rows[0]) throw new NotFoundException('Product not found');

    await this.db.query(
      `UPDATE products SET active = false, updated_at = NOW() WHERE id = $1`,
      [productId],
    );

    return { message: 'Product deactivated (soft deleted) successfully' };
  }

  async updateStock(productId: string, userId: string, dto: UpdateStockDto) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');
    const sellerId = sellerRes.rows[0].id;

    const productRes = await this.db.query<{ id: string }>(
      `SELECT id FROM products WHERE id = $1 AND seller_id = $2`,
      [productId, sellerId],
    );
    if (!productRes.rows[0]) throw new NotFoundException('Product not found');

    for (const variant of dto.variants) {
      const updated = await this.db.query(
        `UPDATE product_variants SET stock = $1
         WHERE id = $2 AND product_id = $3`,
        [variant.stock, variant.variant_id, productId],
      );
      if (updated.rowCount === 0) {
        throw new NotFoundException(
          `Variant ${variant.variant_id} not found for this product`,
        );
      }
    }

    return { message: 'Stock updated successfully' };
  }

  async updateSellerProfile(userId: string, dto: UpdateSellerProfileDto) {
    const sellerRes = await this.db.query<{ id: string }>(
      `SELECT id FROM sellers WHERE user_id = $1`,
      [userId],
    );
    if (!sellerRes.rows[0]) throw new NotFoundException('Seller not found');

    const setParts: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.store_name !== undefined) {
      setParts.push(`store_name = $${idx++}`);
      params.push(dto.store_name);
    }
    if (dto.store_description !== undefined) {
      setParts.push(`store_description = $${idx++}`);
      params.push(dto.store_description);
    }
    if (dto.seller_location !== undefined) {
      setParts.push(`seller_location = $${idx++}`);
      params.push(dto.seller_location);
    }
    if (dto.street !== undefined) {
      setParts.push(`street = $${idx++}`);
      params.push(dto.street);
    }
    if (dto.kecamatan !== undefined) {
      setParts.push(`kecamatan = $${idx++}`);
      params.push(dto.kecamatan);
    }
    if (dto.kelurahan !== undefined) {
      setParts.push(`kelurahan = $${idx++}`);
      params.push(dto.kelurahan);
    }
    if (dto.kode_pos !== undefined) {
      setParts.push(`kode_pos = $${idx++}`);
      params.push(dto.kode_pos);
    }

    if (setParts.length === 0)
      throw new BadRequestException('No fields to update');

    setParts.push(`updated_at = NOW()`);
    params.push(sellerRes.rows[0].id);

    await this.db.query(
      `UPDATE sellers SET ${setParts.join(', ')} WHERE id = $${idx}`,
      params,
    );

    return { message: 'Seller profile updated successfully' };
  }

  private async uploadProductImages(files: {
    image?: Express.Multer.File[];
    image2?: Express.Multer.File[];
    image3?: Express.Multer.File[];
    image4?: Express.Multer.File[];
    image5?: Express.Multer.File[];
  }) {
    const orderedFiles = [
      files.image?.[0],
      files.image2?.[0],
      files.image3?.[0],
      files.image4?.[0],
      files.image5?.[0],
    ];
    const uploaded: ({
      secure_url: string;
      public_id: string;
      sort_order: number;
    } | null)[] = [];

    for (const [index, file] of orderedFiles.entries()) {
      if (!file) {
        uploaded[index] = null;
        continue;
      }
      if (!this.cloudinary) {
        throw new BadRequestException('Cloudinary service is not available');
      }
      const result = await this.cloudinary.uploadImage(
        file,
        'products',
        `product-${index + 1}`,
      );
      uploaded[index] = { ...result, sort_order: index + 1 };
    }

    return uploaded;
  }

  private async insertProductImages(
    productId: string,
    images: { secure_url: string; public_id: string; sort_order: number }[],
  ) {
    if (images.length === 0) return;
    const hasTable = await this.hasTable('product_images');
    if (!hasTable) return;

    for (const image of images) {
      await this.db.query(
        `INSERT INTO product_images
           (product_id, image_url, cloudinary_public_id, sort_order, is_primary, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          productId,
          image.secure_url,
          image.public_id,
          image.sort_order,
          image.sort_order === 1,
        ],
      );
    }
  }

  private async hasTable(tableName: string) {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = $1
       )`,
      [tableName],
    );

    return result.rows[0]?.exists ?? false;
  }
}
