import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ShippingCostDto } from './dto/shipping-cost.dto';

type RajaOngkirStatus = { code: number; description: string };

type RajaOngkirCostResult = {
  code: string;
  name: string;
  costs: {
    service: string;
    description: string;
    cost: { value: number; etd: string; note: string }[];
  }[];
};

type RajaOngkirProvinceItem = { province_id: string; province: string };

type RajaOngkirCityItem = {
  city_id: string;
  province_id: string;
  province: string;
  type: string;
  city_name: string;
  postal_code: string;
};

type RajaOngkirResponse<T> = {
  rajaongkir: { status: RajaOngkirStatus; results: T };
};

const COURIERS: { code: string; name: string; tiers: string[] }[] = [
  {
    code: 'jne',
    name: 'Jalur Nugraha Ekakurir (JNE)',
    tiers: ['starter', 'basic', 'pro'],
  },
  { code: 'pos', name: 'POS Indonesia', tiers: ['basic', 'pro'] },
  {
    code: 'tiki',
    name: 'Citra Van Titipan Kilat (TIKI)',
    tiers: ['basic', 'pro'],
  },
  { code: 'rpx', name: 'RPX Holding', tiers: ['pro'] },
  { code: 'jnt', name: 'J&T Express', tiers: ['pro'] },
  { code: 'sicepat', name: 'SiCepat Ekspres', tiers: ['pro'] },
  { code: 'anteraja', name: 'AnterAja', tiers: ['pro'] },
  { code: 'wahana', name: 'Wahana Prestasi Logistik', tiers: ['pro'] },
  { code: 'ninja', name: 'Ninja Xpress', tiers: ['pro'] },
  { code: 'lion', name: 'Lion Parcel', tiers: ['pro'] },
  { code: 'idl', name: 'IDL Cargo', tiers: ['pro'] },
];

@Injectable()
export class ShippingService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly tier: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.getOrThrow<string>('RAJAONGKIR_API_KEY');
    this.tier = this.config.get<string>('RAJAONGKIR_TYPE') ?? 'starter';

    const tierBaseUrl: Record<string, string> = {
      starter: 'https://api.rajaongkir.com/starter',
      basic: 'https://api.rajaongkir.com/basic',
      pro: 'https://api.rajaongkir.com/pro',
    };
    this.baseUrl = tierBaseUrl[this.tier] ?? tierBaseUrl['starter'];
  }

  async calculateCost(dto: ShippingCostDto) {
    const body = new URLSearchParams({
      origin: String(dto.origin_city_id),
      destination: String(dto.destination_city_id),
      weight: String(dto.weight),
      courier: dto.courier.toLowerCase(),
    }).toString();

    try {
      const { data } = await axios.post<
        RajaOngkirResponse<RajaOngkirCostResult[]>
      >(`${this.baseUrl}/cost`, body, {
        headers: {
          key: this.apiKey,
          'content-type': 'application/x-www-form-urlencoded',
        },
      });

      const { status, results } = data.rajaongkir;
      if (status.code !== 200) {
        throw new BadRequestException(status.description);
      }

      return results.map((courier) => ({
        courier_code: courier.code,
        courier_name: courier.name,
        services: courier.costs.map((s) => ({
          service: s.service,
          description: s.description,
          cost: s.cost[0]?.value ?? 0,
          etd: s.cost[0]?.etd ?? '-',
          note: s.cost[0]?.note ?? '',
        })),
      }));
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;

      const rajaongkirDesc = (
        err as {
          response?: {
            data?: { rajaongkir?: { status?: { description?: string } } };
          };
        }
      )?.response?.data?.rajaongkir?.status?.description;

      throw new BadRequestException(
        rajaongkirDesc ??
          'Gagal menghitung ongkos kirim. Periksa API key atau parameter.',
      );
    }
  }

  async getServiceCost(params: {
    origin_city_id: number;
    destination_city_id: number;
    weight: number;
    courier: string;
    service: string;
  }): Promise<number> {
    const results = await this.calculateCost({
      origin_city_id: params.origin_city_id,
      destination_city_id: params.destination_city_id,
      weight: params.weight,
      courier: params.courier,
    } as ShippingCostDto);

    const courierResult = results[0];
    if (!courierResult) {
      throw new BadRequestException(
        `Kurir ${params.courier.toUpperCase()} tidak tersedia untuk rute ini`,
      );
    }

    const serviceResult = courierResult.services.find(
      (s) => s.service.toUpperCase() === params.service.toUpperCase(),
    );
    if (!serviceResult) {
      throw new BadRequestException(
        `Layanan ${params.service.toUpperCase()} tidak tersedia untuk kurir ${params.courier.toUpperCase()}`,
      );
    }

    return serviceResult.cost;
  }

  getCouriers() {
    return COURIERS.filter((c) => c.tiers.includes(this.tier)).map((c) => ({
      code: c.code,
      name: c.name,
    }));
  }

  async getProvinces() {
    try {
      const { data } = await axios.get<
        RajaOngkirResponse<RajaOngkirProvinceItem[]>
      >(`${this.baseUrl}/province`, { headers: { key: this.apiKey } });

      const { status, results } = data.rajaongkir;
      if (status.code !== 200) {
        throw new BadRequestException(status.description);
      }

      return results.map((p) => ({
        id: Number(p.province_id),
        name: p.province,
      }));
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Gagal mengambil data provinsi.');
    }
  }

  async getCities(provinceId?: number) {
    const url = provinceId
      ? `${this.baseUrl}/city?province=${provinceId}`
      : `${this.baseUrl}/city`;

    try {
      const { data } = await axios.get<
        RajaOngkirResponse<RajaOngkirCityItem[]>
      >(url, {
        headers: { key: this.apiKey },
      });

      const { status, results } = data.rajaongkir;
      if (status.code !== 200) {
        throw new BadRequestException(status.description);
      }

      return results.map((c) => ({
        id: Number(c.city_id),
        province_id: Number(c.province_id),
        province: c.province,
        type: c.type,
        name: c.city_name,
        postal_code: c.postal_code,
      }));
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Gagal mengambil data kota/kabupaten.');
    }
  }
}
