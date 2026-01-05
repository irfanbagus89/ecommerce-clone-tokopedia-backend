/* eslint-disable @typescript-eslint/no-unsafe-call */

import { IsNotEmpty, IsUUID } from 'class-validator';

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
}
