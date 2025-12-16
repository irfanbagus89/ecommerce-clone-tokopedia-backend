/* eslint-disable @typescript-eslint/no-unsafe-call */
import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  store_name: string;

  @IsString()
  @IsNotEmpty()
  store_description: string;
}
