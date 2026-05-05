import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ShippingCostDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  origin_city_id: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  destination_city_id: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  weight: number;

  @IsString()
  @IsOptional()
  courier?: string;
}
