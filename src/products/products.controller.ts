import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateDto } from './dto/create.dto';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { JwtPayload } from 'src/auth/jwt.strategy';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { Roles } from 'src/auth/roles/roles.decorator';
import { IntentparserService } from 'src/intentparser/intentparser.service';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productService: ProductsService,
    private readonly intentParser: IntentparserService,
  ) {}

  @Post()
  @Roles('seller')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(FileInterceptor('image'))
  @HttpCode(201)
  create(
    @Body() dto: CreateDto,
    @UploadedFile() image: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.productService.create(dto, req.user.userId, image);
  }

  @Get()
  @HttpCode(200)
  async getProductsSearch(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search: string = '',
    @Query('storeTypes') storeTypes: number[] | null = null,
    @Query('locations') locations: string[] | null = null,
    @Query('minPrice') minPrice: number | null = null,
    @Query('maxPrice') maxPrice: number | null = null,
    @Query('smart') smart: boolean = false,
  ) {
    if (smart === false) {
      return this.productService.getProducts(
        Number(page),
        Number(limit),
        search,
        storeTypes,
        locations,
        minPrice,
        maxPrice,
      );
    } else {
      return 'tes';
    }
  }

  @Get('/official')
  @HttpCode(200)
  getProductOfficial(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.productService.getProductOfficial(Number(page), Number(limit));
  }

  @Get('/foryou')
  @HttpCode(200)
  getForYouProducts(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.productService.getForYouProducts(Number(page), Number(limit));
  }

  @Get('/recommendations-by-store')
  @HttpCode(200)
  getRecommendationsProductByStore(
    @Query('sellerId') sellerId: string,
    @Query('categoryId') categoryId: string,
    @Query('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.productService.getRecommendationsProductByStore(
      sellerId,
      categoryId,
      id,
      Number(page),
      Number(limit),
    );
  }
  @Get('/:id')
  @HttpCode(200)
  getProductDetail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.productService.getProductDetail(id);
  }
  @Get('/category/:categoryId')
  @HttpCode(200)
  getProductByCategory(
    @Param('categoryId', new ParseUUIDPipe({ version: '4' }))
    categoryId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.productService.getProductByCategory(
      categoryId,
      Number(page),
      Number(limit),
    );
  }
}
