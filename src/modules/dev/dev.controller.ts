import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { DevService } from './dev.service';
import { DevOrderStatusDto } from './dto/dev-order-status.dto';

@Controller({ path: 'dev', version: '1' })
export class DevController implements OnModuleInit {
  constructor(private readonly devService: DevService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DevModule must not be loaded in production');
    }
  }

  private guardDev() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Dev endpoints are disabled in production');
    }
  }

  @Get('orders/:id')
  @UseGuards(JwtAuthGuard)
  getOrderSnapshot(
    @Param('id', new ParseUUIDPipe({ version: '4' })) orderId: string,
  ) {
    this.guardDev();
    return this.devService.getOrderSnapshot(orderId);
  }

  @Patch('orders/:id/status')
  @UseGuards(JwtAuthGuard)
  setOrderStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() dto: DevOrderStatusDto,
  ) {
    this.guardDev();
    return this.devService.setOrderStatus(orderId, dto);
  }

  @Post('orders/:id/simulate-payment')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  simulatePayment(
    @Param('id', new ParseUUIDPipe({ version: '4' })) orderId: string,
  ) {
    this.guardDev();
    return this.devService.simulatePayment(orderId);
  }
}
