import { Module } from '@nestjs/common';
import { SellerController } from './seller.controller';
import { SellerService } from './seller.service';
import { ProductsModule } from '../products/products.module';
import { SellerDashboardService } from './seller-dashboard.service';
import { SellerDashboardController } from './seller-dashboard.controller';

@Module({
  imports: [ProductsModule],
  controllers: [SellerDashboardController, SellerController],
  providers: [SellerService, SellerDashboardService],
  exports: [SellerService],
})
export class SellerModule {}
