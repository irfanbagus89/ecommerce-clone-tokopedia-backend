import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CheckoutDto {
  @IsArray()
  @IsUUID('all', { each: true })
  @IsNotEmpty()
  cart_item_ids: string[];

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  postal_code?: string;
}
