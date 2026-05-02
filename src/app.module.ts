import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './common/database/database.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { SellerModule } from './modules/seller/seller.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { CartsModule } from './modules/carts/carts.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AdminModule } from './modules/admin/admin.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { WishlistsModule } from './modules/wishlists/wishlists.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ChatModule } from './modules/chat/chat.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CloudinaryModule } from './common/cloudinary';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    CloudinaryModule,
    DatabaseModule,
    AuthModule,
    SellerModule,
    CategoriesModule,
    ProductsModule,
    ReviewsModule,
    CartsModule,
    OrdersModule,
    AdminModule,
    VouchersModule,
    WishlistsModule,
    AddressesModule,
    NotificationsModule,
    ChatModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
