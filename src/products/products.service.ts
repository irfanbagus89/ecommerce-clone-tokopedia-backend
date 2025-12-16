/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { CreateDto } from './dto/create.dto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { CreateProductResponse } from './interface/products.interface';

interface Product {
  id: string;
  name: string;
}

@Injectable()
export class ProductsService {
  constructor(@Inject('PG_POOL') private db: Pool) {}

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
}
