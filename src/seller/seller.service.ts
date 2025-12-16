import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { SellerResponse } from './interface/seller-response.interface';
import { RegisterDto } from './dto/register.dto';

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
