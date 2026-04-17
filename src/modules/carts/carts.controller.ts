import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CartsService } from './carts.service';
import { CreateDto } from './dto/create.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common';

@Controller({ path: 'carts', version: '1' })
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  createCart(@Body() dto: CreateDto, @CurrentUser('sub') user_id: string) {
    return this.cartsService.createCart(
      user_id,
      dto.sellerId,
      dto.productId,
      dto.variantId,
      dto.quantity,
      dto.type,
    );
  }

  @Get()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  getMyCart(@CurrentUser('sub') user_id: string) {
    return this.cartsService.getMyCart(user_id);
  }

  @Get('count-mycart')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  getCountMyCart(@CurrentUser('sub') user_id: string) {
    return this.cartsService.getCountMyCart(user_id);
  }
  @Patch('update-is-checked/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  updateIsChecked(@Param('id') id: string) {
    return this.cartsService.updateIsCheckedCartItem(id);
  }
}
