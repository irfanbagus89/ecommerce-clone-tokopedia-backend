import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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
  seller_location?: string;

  @IsString()
  @IsOptional()
  street?: string;

  @IsString()
  @IsOptional()
  kecamatan?: string;

  @IsString()
  @IsOptional()
  kelurahan?: string;

  @IsString()
  @IsOptional()
  kode_pos?: string;
}
