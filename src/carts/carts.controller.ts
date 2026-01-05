import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CartsService } from './carts.service';
import { JwtPayload } from 'src/auth/jwt.strategy';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { CreateDto } from './dto/create.dto';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller('carts')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  createCart(@Body() dto: CreateDto, @Req() req: AuthenticatedRequest) {
    return this.cartsService.createCart(
      req.user.userId,
      dto.sellerId,
      dto.productId,
      dto.variantId,
      dto.quantity,
    );
  }

  @Get()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  getMyCart(@Req() req: AuthenticatedRequest) {
    return this.cartsService.getMyCart(req.user.userId);
  }
}
