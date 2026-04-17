import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common';
import { CheckoutDto } from './dto/checkout.dto';
import { OrdersService } from './orders.service';

@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(@CurrentUser('sub') userId: string, @Body() dto: CheckoutDto) {
    return this.ordersService.checkout(
      userId,
      dto.cart_item_ids,
      dto.address,
      dto.city,
      dto.postal_code,
    );
  }

  @Post('midtrans/webhook')
  async midtransWebhook(@Body() payload: Record<string, unknown>) {
    return await this.ordersService.handleMidtransWebhook(payload);
  }
}
