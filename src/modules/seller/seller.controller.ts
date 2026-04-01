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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SellerService } from './seller.service';
import { RegisterDto } from './dto/register.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CreateDto } from './dto/create.dto';
import { CurrentUser, Roles } from 'src/common';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ProductsService } from '../products/products.service';

@Controller({ path: 'seller', version: '1' })
export class SellerController {
  constructor(
    private sellerService: SellerService,
    private productService: ProductsService,
  ) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  register(@Body() dto: RegisterDto, @CurrentUser('sub') user_id: string) {
    return this.sellerService.registerSeller(dto, user_id);
  }

  @Post('products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('seller')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'image2', maxCount: 1 },
      { name: 'image3', maxCount: 1 },
      { name: 'image4', maxCount: 1 },
      { name: 'image5', maxCount: 1 },
    ]),
  )
  @HttpCode(201)
  createProduct(
    @Body() dto: CreateDto,
    @UploadedFiles()
    files: {
      image?: Express.Multer.File[];
      image2?: Express.Multer.File[];
      image3?: Express.Multer.File[];
      image4?: Express.Multer.File[];
      image5?: Express.Multer.File[];
    },
    @CurrentUser('sub') user_id: string,
  ) {
    return this.sellerService.create(dto, user_id, files);
  }

  @Get('my-products')
  @HttpCode(200)
  @Roles('seller')
  @UseGuards(JwtAuthGuard, RolesGuard)
  getMyProductsSeller(
    @CurrentUser('sub') user_id: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('sort') sort: 'name' | 'price' | 'active' = 'name',
    @Query('order') order: 'asc' | 'desc' = 'asc',
  ) {
    return this.sellerService.getMyProductsSeller(
      user_id,
      Number(page),
      Number(limit),
      search,
      sort,
      order,
    );
  }

  @Delete('products-variants/:id')
  @HttpCode(200)
  @Roles('seller')
  @UseGuards(JwtAuthGuard, RolesGuard)
  deleteProductVariant(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('sub') user_id: string,
  ) {
    return this.sellerService.deleteProductVariant(id, user_id);
  }

  @Get(':id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  getStore(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.sellerService.getStore(id);
  }

  @Get('products/:id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  getProductDetail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.productService.getProductDetail(id);
  }
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser('sub') user_id: string) {
    return this.sellerService.getProfile(user_id);
  }
}
