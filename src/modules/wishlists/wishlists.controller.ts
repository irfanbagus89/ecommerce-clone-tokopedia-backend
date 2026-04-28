import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WishlistsService } from './wishlists.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common';

@Controller({ path: 'wishlists', version: '1' })
@UseGuards(JwtAuthGuard)
export class WishlistsController {
  constructor(private readonly wishlistsService: WishlistsService) {}

  @Get()
  @HttpCode(200)
  getWishlists(
    @CurrentUser('sub') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.wishlistsService.getWishlists(
      userId,
      Number(page),
      Number(limit),
    );
  }

  @Post(':productId')
  @HttpCode(201)
  addToWishlist(
    @CurrentUser('sub') userId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.wishlistsService.addToWishlist(userId, productId);
  }

  @Delete(':productId')
  @HttpCode(200)
  removeFromWishlist(
    @CurrentUser('sub') userId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.wishlistsService.removeFromWishlist(userId, productId);
  }

  @Get('check/:productId')
  @HttpCode(200)
  checkWishlist(
    @CurrentUser('sub') userId: string,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    return this.wishlistsService.checkWishlist(userId, productId);
  }
}
