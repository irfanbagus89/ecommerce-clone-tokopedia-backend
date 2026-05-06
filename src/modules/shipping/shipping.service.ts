import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { ShippingCostDto } from './dto/shipping-cost.dto';

type Zone = 'lokal' | 'regional' | 'nasional';

interface ServiceTier {
  service: string;
  description: string;
  lokal: number;
  regional: number;
  nasional: number;
  etd_lokal: string;
  etd_regional: string;
  etd_nasional: string;
}

interface CourierDef {
  courier_code: string;
  courier_name: string;
  services: ServiceTier[];
}

const COURIERS: CourierDef[] = [
  {
    courier_code: 'jne',
    courier_name: 'JNE',
    services: [
      {
        service: 'OKE',
        description: 'Ongkos Kirim Ekonomis',
        lokal: 6_000,
        regional: 7_000,
        nasional: 9_000,
        etd_lokal: '5-7',
        etd_regional: '4-6',
        etd_nasional: '7-14',
      },
      {
        service: 'REG',
        description: 'Reguler',
        lokal: 8_000,
        regional: 9_000,
        nasional: 12_000,
        etd_lokal: '2-3',
        etd_regional: '3-5',
        etd_nasional: '5-7',
      },
      {
        service: 'YES',
        description: 'Yakin Esok Sampai',
        lokal: 18_000,
        regional: 19_000,
        nasional: 22_000,
        etd_lokal: '1',
        etd_regional: '1-2',
        etd_nasional: '2-3',
      },
    ],
  },
  {
    courier_code: 'jnt',
    courier_name: 'J&T Express',
    services: [
      {
        service: 'REG',
        description: 'Reguler',
        lokal: 7_000,
        regional: 8_000,
        nasional: 11_000,
        etd_lokal: '2-3',
        etd_regional: '3-4',
        etd_nasional: '4-7',
      },
      {
        service: 'EZ',
        description: 'Express',
        lokal: 10_000,
        regional: 12_000,
        nasional: 15_000,
        etd_lokal: '1-2',
        etd_regional: '2-3',
        etd_nasional: '3-5',
      },
    ],
  },
  {
    courier_code: 'sicepat',
    courier_name: 'SiCepat',
    services: [
      {
        service: 'REG',
        description: 'Reguler',
        lokal: 7_000,
        regional: 8_000,
        nasional: 11_000,
        etd_lokal: '2-3',
        etd_regional: '3-4',
        etd_nasional: '4-7',
      },
      {
        service: 'BEST',
        description: 'Best Express',
        lokal: 12_000,
        regional: 14_000,
        nasional: 17_000,
        etd_lokal: '1-2',
        etd_regional: '2-3',
        etd_nasional: '3-5',
      },
    ],
  },
  {
    courier_code: 'pos',
    courier_name: 'POS Indonesia',
    services: [
      {
        service: 'KILAT',
        description: 'Kilat Khusus',
        lokal: 6_000,
        regional: 7_000,
        nasional: 9_000,
        etd_lokal: '3-5',
        etd_regional: '4-7',
        etd_nasional: '7-14',
      },
    ],
  },
  {
    courier_code: 'anteraja',
    courier_name: 'AnterAja',
    services: [
      {
        service: 'REG',
        description: 'Reguler',
        lokal: 7_000,
        regional: 8_000,
        nasional: 10_000,
        etd_lokal: '2-3',
        etd_regional: '3-5',
        etd_nasional: '5-7',
      },
    ],
  },
  {
    courier_code: 'sap',
    courier_name: 'SAP Express',
    services: [
      {
        service: 'REG',
        description: 'Reguler',
        lokal: 7_000,
        regional: 9_000,
        nasional: 12_000,
        etd_lokal: '2-3',
        etd_regional: '3-5',
        etd_nasional: '5-8',
      },
    ],
  },
];

@Injectable()
export class ShippingService {
  constructor(@Inject('DATABASE_POOL') private readonly db: Pool) {}

  private async getProvinceId(cityId: number): Promise<number | null> {
    const res = await this.db.query<{ province_id: number }>(
      'SELECT province_id FROM cities WHERE id = $1',
      [cityId],
    );
    return res.rows[0]?.province_id ?? null;
  }

  private determineZone(
    originProvinceId: number | null,
    destinationProvinceId: number | null,
    originCityId: number,
    destinationCityId: number,
  ): Zone {
    if (originCityId === destinationCityId) return 'lokal';
    if (
      originProvinceId !== null &&
      destinationProvinceId !== null &&
      originProvinceId === destinationProvinceId
    )
      return 'regional';
    return 'nasional';
  }

  private calcCost(pricePerKg: number, weightGrams: number): number {
    const kg = Math.max(1, Math.ceil(weightGrams / 1000));
    return pricePerKg * kg;
  }

  async calculateCost(dto: ShippingCostDto) {
    const [originProvince, destProvince] = await Promise.all([
      this.getProvinceId(dto.origin_city_id),
      this.getProvinceId(dto.destination_city_id),
    ]);

    const zone = this.determineZone(
      originProvince,
      destProvince,
      dto.origin_city_id,
      dto.destination_city_id,
    );

    const couriers = dto.courier
      ? COURIERS.filter((c) => c.courier_code === dto.courier!.toLowerCase())
      : COURIERS;

    if (dto.courier && couriers.length === 0) {
      throw new BadRequestException(`Kurir "${dto.courier}" tidak tersedia.`);
    }

    return couriers.map((courier) => ({
      courier_code: courier.courier_code,
      courier_name: courier.courier_name,
      services: courier.services.map((svc) => ({
        service: svc.service,
        description: svc.description,
        cost: this.calcCost(svc[zone], dto.weight),
        etd: svc[`etd_${zone}`],
        note: '',
      })),
    }));
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
    });

    const courierResult = results[0];
    if (!courierResult) {
      throw new BadRequestException(
        `Kurir ${params.courier.toUpperCase()} tidak tersedia.`,
      );
    }

    const serviceResult = courierResult.services.find(
      (s) => s.service.toUpperCase() === params.service.toUpperCase(),
    );
    if (!serviceResult) {
      throw new BadRequestException(
        `Layanan ${params.service.toUpperCase()} tidak tersedia untuk kurir ${params.courier.toUpperCase()}.`,
      );
    }

    return serviceResult.cost;
  }

  getCouriers() {
    return COURIERS.map((c) => ({
      code: c.courier_code,
      name: c.courier_name,
    }));
  }
}
