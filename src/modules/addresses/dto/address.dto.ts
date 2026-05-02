import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAddressDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsNotEmpty()
  recipient_name: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsNumber()
  city_id: number;

  @IsNumber()
  kecamatan_id: number;

  @IsNumber()
  kelurahan_id: number;

  @IsNumber()
  province_id: number;

  @IsString()
  @IsOptional()
  postal_code?: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  is_default?: boolean;
}

export class UpdateAddressDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  recipient_name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  kecamatan?: string;

  @IsString()
  @IsOptional()
  kelurahan?: string;

  @IsString()
  @IsOptional()
  postal_code?: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  is_default?: boolean;
}
