import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ShippingSelectionDto {
  @IsUUID()
  seller_id: string;

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
  @IsNotEmpty()
  courier: string;

  @IsString()
  @IsNotEmpty()
  service: string;
}

export class CheckoutDto {
  @IsArray()
  @IsUUID('all', { each: true })
  @IsNotEmpty()
  cart_item_ids: string[];

  @IsString()
  @IsOptional()
  payment_method_code?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  postal_code?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShippingSelectionDto)
  @IsOptional()
  shipping_selections?: ShippingSelectionDto[];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  shipping_cost?: number;

  @IsString()
  @IsOptional()
  shipping_method?: string;

  @IsString()
  @IsOptional()
  voucher_code?: string;
}

export class CheckoutPreviewDto {
  @IsArray()
  @IsUUID('all', { each: true })
  @IsNotEmpty()
  cart_item_ids: string[];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  shipping_cost?: number;

  @IsString()
  @IsOptional()
  voucher_code?: string;
}
