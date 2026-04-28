import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ShipOrderDto {
  @IsString()
  @IsNotEmpty()
  tracking_number: string;

  @IsString()
  @IsOptional()
  shipping_method?: string;
}
