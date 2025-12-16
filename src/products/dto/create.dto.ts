/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDto {
  @IsUUID()
  @IsNotEmpty()
  category_id: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description: string;

  @IsNotEmpty()
  price: number;

  @IsNotEmpty()
  stock: number;
}
