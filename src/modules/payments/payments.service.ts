import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class PaymentsService {
  constructor(@Inject('DATABASE_POOL') private db: Pool) {}

  async getPaymentMethods() {
    const result = await this.db.query<{
      id: string;
      name: string;
      code: string;
      type: string;
      logo_url: string | null;
    }>(
      `SELECT id, name, code, type, logo_url 
       FROM payment_methods 
       WHERE is_active = true 
       ORDER BY type, name`,
    );

    return result.rows;
  }
}
