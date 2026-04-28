import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVoucherDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsIn(['percentage', 'nominal', 'free_shipping'])
  type: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  min_purchase?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  max_discount?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  usage_limit?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  per_user_limit?: number;

  @IsUUID()
  @IsOptional()
  seller_id?: string;

  @IsDateString()
  @IsOptional()
  valid_from?: string;

  @IsDateString()
  @IsOptional()
  valid_until?: string;
}

export class ApplyVoucherDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  total_amount: number;
}
