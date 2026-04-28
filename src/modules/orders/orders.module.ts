import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CronService } from './cron.service';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, CronService],
})
export class OrdersModule {}
