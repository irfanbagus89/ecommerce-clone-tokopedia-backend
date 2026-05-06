import { IsEnum, IsOptional, IsString } from 'class-validator';

export class DevOrderStatusDto {
  @IsOptional()
  @IsEnum(['pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'])
  order_status?: string;

  @IsOptional()
  @IsEnum(['pending', 'shipped', 'delivered'])
  shipping_status?: string;

  @IsOptional()
  @IsEnum(['unpaid', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded'])
  payment_status?: string;

  @IsOptional()
  @IsString()
  tracking_number?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
