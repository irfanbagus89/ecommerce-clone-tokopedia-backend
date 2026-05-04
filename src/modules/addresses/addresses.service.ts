import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

export interface AddressRow {
  id: string;
  label: string | null;
  recipient_name: string;
  phone: string | null;
  address: string;
  province: string | null;
  city: string | null;
  kecamatan: string | null;
  kelurahan: string | null;
  postal_code: string | null;
  is_default: boolean;
}

@Injectable()
export class AddressesService {
  constructor(@Inject('DATABASE_POOL') private db: Pool) {}

  async getAddresses(userId: string): Promise<AddressRow[]> {
    const rows = await this.db.query<AddressRow>(
      `SELECT
         ua.id,
         ua.label,
         ua.recipient_name,
         ua.phone,
         ua.address,
         ua.province_id,
         ua.city_id,
         ua.kecamatan_id,
         ua.kelurahan_id,
         p."name" AS province,
         c."name" AS city,
         k."name" AS kecamatan,
         k2."name" AS kelurahan,
         ua.postal_code,
         ua.is_default
       FROM user_addresses ua
       JOIN provinces p ON p.id = ua.province_id
       JOIN cities c ON c.id = ua.city_id
       JOIN kecamatan k ON k.id = ua.kecamatan_id
       JOIN kelurahan k2 ON k2.id = ua.kelurahan_id
       WHERE ua.user_id = $1
       ORDER BY ua.is_default DESC, ua.created_at DESC`,
      [userId],
    );
    return rows.rows;
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      if (dto.is_default) {
        await client.query(
          `UPDATE user_addresses 
         SET is_default = false 
         WHERE user_id = $1`,
          [userId],
        );
      }

      const result = await client.query<{ id: string }>(
        `INSERT INTO user_addresses
        (user_id, label, recipient_name, phone, address, city_id,
         kecamatan_id, kelurahan_id, province_id, postal_code, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
        [
          userId,
          dto.label,
          dto.recipient_name,
          dto.phone,
          dto.address,
          dto.city_id,
          dto.kecamatan_id,
          dto.kelurahan_id,
          dto.province_id,
          dto.postal_code,
          dto.is_default,
        ],
      );

      await client.query('COMMIT');

      return {
        message: 'Address created',
        address_id: result.rows[0].id,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAddress(
    addressId: string,
    userId: string,
    dto: UpdateAddressDto,
  ) {
    const addrRes = await this.db.query<{ id: string }>(
      `SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId],
    );
    if (!addrRes.rows[0]) throw new NotFoundException('Address not found');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      if (dto.is_default) {
        await client.query(
          `UPDATE user_addresses SET is_default = false WHERE user_id = $1`,
          [userId],
        );
      }

      const setParts: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      type StringField = Exclude<keyof UpdateAddressDto, 'is_default'>;
      const stringFields: StringField[] = [
        'label',
        'recipient_name',
        'phone',
        'address',
        'city',
        'kecamatan',
        'kelurahan',
        'postal_code',
      ];

      for (const f of stringFields) {
        const val: string | undefined = (
          dto as Record<StringField, string | undefined>
        )[f];
        if (val !== undefined) {
          setParts.push(`${String(f)} = $${idx++}`);
          params.push(val);
        }
      }

      if (dto.is_default !== undefined) {
        setParts.push(`is_default = $${idx++}`);
        params.push(dto.is_default);
      }

      if (setParts.length === 0)
        throw new BadRequestException('No fields to update');
      setParts.push(`updated_at = NOW()`);
      params.push(addressId);

      await client.query(
        `UPDATE user_addresses SET ${setParts.join(', ')} WHERE id = $${idx}`,
        params,
      );

      await client.query('COMMIT');
      return { message: 'Address updated' };
    } catch (e: unknown) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteAddress(addressId: string, userId: string) {
    const res = await this.db.query(
      `DELETE FROM user_addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId],
    );
    if (res.rowCount === 0) throw new NotFoundException('Address not found');
    return { message: 'Address deleted' };
  }

  async setDefaultAddress(addressId: string, userId: string) {
    const addrRes = await this.db.query<{ id: string }>(
      `SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId],
    );
    if (!addrRes.rows[0]) throw new NotFoundException('Address not found');

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE user_addresses SET is_default = false WHERE user_id = $1`,
        [userId],
      );
      await client.query(
        `UPDATE user_addresses SET is_default = true, updated_at = NOW() WHERE id = $1`,
        [addressId],
      );
      await client.query('COMMIT');
      return { message: 'Default address updated' };
    } catch (e: unknown) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getDefaultAddress(userId: string): Promise<AddressRow> {
    const res = await this.db.query<AddressRow>(
      `SELECT
         ua.id,
         ua.label,
         ua.recipient_name,
         ua.phone,
         ua.address,
         ua.province_id,
         ua.city_id,
         ua.kecamatan_id,
         ua.kelurahan_id,
         p."name" AS province,
         c."name" AS city,
         k."name" AS kecamatan,
         k2."name" AS kelurahan,
         ua.postal_code,
         ua.is_default
       FROM user_addresses ua
       JOIN provinces p ON p.id = ua.province_id
       JOIN cities c ON c.id = ua.city_id
       JOIN kecamatan k ON k.id = ua.kecamatan_id
       JOIN kelurahan k2 ON k2.id = ua.kelurahan_id
       WHERE user_id = $1 AND is_default = true
       LIMIT 1`,
      [userId],
    );
    if (!res.rows[0]) throw new NotFoundException('No default address set');
    return res.rows[0];
  }

  async getProvince(): Promise<
    {
      id: string;
      name: string;
    }[]
  > {
    const res = await this.db.query<{ id: string; name: string }>(
      `SELECT id, name FROM provinces`,
    );
    return res.rows.map((province) => {
      return {
        id: province.id,
        name: province.name,
      };
    });
  }

  async getCity(provinceId: string): Promise<
    {
      id: string;
      name: string;
    }[]
  > {
    const res = await this.db.query<{ id: string; name: string }>(
      `SELECT id, name FROM cities WHERE province_id = $1`,
      [provinceId],
    );
    return res.rows.map((city) => {
      return {
        id: city.id,
        name: city.name,
      };
    });
  }

  async getKecamatan(cityId: string): Promise<
    {
      id: string;
      name: string;
    }[]
  > {
    const res = await this.db.query<{ id: string; name: string }>(
      `SELECT id, name FROM kecamatan WHERE city_id = $1`,
      [cityId],
    );
    return res.rows.map((kecamatan) => {
      return {
        id: kecamatan.id,
        name: kecamatan.name,
      };
    });
  }

  async getKelurahan(kecamatanId: string): Promise<
    {
      id: string;
      name: string;
    }[]
  > {
    const res = await this.db.query<{
      id: string;
      name: string;
    }>(`SELECT id, name FROM kelurahan WHERE kecamatan_id = $1`, [kecamatanId]);
    return res.rows.map((kelurahan) => {
      return {
        id: kelurahan.id,
        name: kelurahan.name,
      };
    });
  }
}
