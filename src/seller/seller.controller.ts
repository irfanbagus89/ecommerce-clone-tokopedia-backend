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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SellerService } from './seller.service';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from 'src/auth/jwt.strategy';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { Roles } from 'src/auth/roles/roles.decorator';
import { RolesGuard } from 'src/auth/roles/roles.guard';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CreateDto } from './dto/create.dto';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller('seller')
export class SellerController {
  constructor(private sellerService: SellerService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  register(@Body() dto: RegisterDto, @Req() req: AuthenticatedRequest) {
    return this.sellerService.registerSeller(dto, req.user.userId);
  }

  @Post('products')
  @Roles('seller')
  @UseGuards(JwtAuthGuard, RolesGuard)
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
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sellerService.create(dto, req.user.userId, files);
  }

  @Get('my-products')
  @HttpCode(200)
  @Roles('seller')
  @UseGuards(JwtAuthGuard, RolesGuard)
  getMyProductsSeller(
    @Req() req: AuthenticatedRequest,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('sort') sort: 'name' | 'price' | 'active' = 'name',
    @Query('order') order: 'asc' | 'desc' = 'asc',
  ) {
    return this.sellerService.getMyProductsSeller(
      req.user.userId,
      Number(page),
      Number(limit),
      search,
      sort,
      order,
    );
  }

  @Get(':id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  getStore(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.sellerService.getStore(id);
  }
}
