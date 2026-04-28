import { Module } from '@nestjs/common';
import { WishlistsService } from './wishlists.service';
import { WishlistsController } from './wishlists.controller';

@Module({
  providers: [WishlistsService],
  controllers: [WishlistsController],
})
export class WishlistsModule {}
