import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class VariantStockDto {
  @IsUUID()
  variant_id: string;

  @IsNumber()
  @Type(() => Number)
  stock: number;
}

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  price?: number;

  @IsUUID()
  @IsOptional()
  category_id?: string;
}

export class UpdateStockDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantStockDto)
  @IsNotEmpty()
  variants: VariantStockDto[];
}

export class UpdateSellerProfileDto {
  @IsString()
  @IsOptional()
  store_name?: string;

  @IsString()
  @IsOptional()
  store_description?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  street?: string;

  @IsString()
  @IsOptional()
  postal_code?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  province_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  city_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  kecamatan_id?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  kelurahan_id?: number;
}
