import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CronService } from './cron.service';
import { ShippingModule } from '../shipping/shipping.module';
import { VouchersModule } from '../vouchers/vouchers.module';

@Module({
  imports: [ShippingModule, VouchersModule],
  controllers: [OrdersController],
  providers: [OrdersService, CronService],
})
export class OrdersModule {}
