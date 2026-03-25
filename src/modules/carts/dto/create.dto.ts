/* eslint-disable @typescript-eslint/no-unsafe-call */

import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateDto {
  @IsUUID()
  @IsNotEmpty()
  sellerId: string;

  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsUUID()
  @IsNotEmpty()
  variantId: string;

  @IsNotEmpty()
  quantity: number;

  @IsOptional()
  type?: string;
}
