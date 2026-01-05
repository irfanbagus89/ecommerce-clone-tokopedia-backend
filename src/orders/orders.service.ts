import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class OrdersService {
  constructor(@Inject('PG_POOL') private db: Pool) {}

  async getAllCheckoutOrders(page: number, limit: number): Promise<any[]> {
    const offset = (page - 1) * limit;
    const productsCheckout = await this.db.query(
      'SELECT * FROM checkout_orders LIMIT $1 OFFSET $2',
      [limit, offset],
    );
    return productsCheckout.rows;
  }
}
