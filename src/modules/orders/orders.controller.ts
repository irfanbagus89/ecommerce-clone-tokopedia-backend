import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser, Roles } from 'src/common';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { ShipOrderDto } from './dto/ship-order.dto';
import { OrdersService } from './orders.service';

@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ─── Buyer ─────────────────────────────────────────────────────────────────

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  checkout(
    @CurrentUser('sub') userId: string,
    @Body() dto: CheckoutDto,
  ): Promise<unknown> {
    return this.ordersService.checkout(
      userId,
      dto.cart_item_ids,
      dto.payment_method_code,
      dto.address,
      dto.city,
      dto.postal_code,
    );
  }

  @Get('my-orders')
  @UseGuards(JwtAuthGuard)
  getMyOrders(
    @CurrentUser('sub') userId: string,
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.ordersService.getMyOrders(
      userId,
      status,
      Number(page),
      Number(limit),
    );
  }

  @Get('my-orders/:id')
  @UseGuards(JwtAuthGuard)
  getOrderDetail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.ordersService.getOrderDetail(orderId, userId);
  }

  @Post('my-orders/:id/confirm')
  @UseGuards(JwtAuthGuard)
  confirmOrder(
    @Param('id', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.ordersService.confirmOrderReceived(orderId, userId);
  }

  @Post('my-orders/:id/cancel')
  @UseGuards(JwtAuthGuard)
  cancelOrder(
    @Param('id', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.ordersService.cancelOrder(orderId, userId);
  }

  // ─── Seller ────────────────────────────────────────────────────────────────

  @Get('seller')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('seller')
  getSellerOrders(
    @CurrentUser('sub') userId: string,
    @Query('status') status?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.ordersService.getSellerOrders(
      userId,
      status,
      Number(page),
      Number(limit),
    );
  }

  @Post('seller/:id/accept')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('seller')
  acceptOrder(
    @Param('id', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.ordersService.acceptOrder(orderId, userId);
  }

  @Post('seller/:id/ship')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('seller')
  shipOrder(
    @Param('id', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: ShipOrderDto,
  ) {
    return this.ordersService.shipOrder(
      orderId,
      userId,
      dto.tracking_number,
      dto.shipping_method,
    );
  }

  // ─── Shared ────────────────────────────────────────────────────────────────

  @Get(':id/history')
  @UseGuards(JwtAuthGuard)
  getOrderHistory(
    @Param('id', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.ordersService.getOrderHistory(orderId, userId);
  }

  // ─── Webhook ───────────────────────────────────────────────────────────────

  @Post('midtrans/webhook')
  async midtransWebhook(@Body() payload: Record<string, unknown>) {
    return await this.ordersService.handleMidtransWebhook(payload);
  }
}
