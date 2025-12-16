import {
  Body,
  Controller,
  HttpCode,
  Post,
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

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productService: ProductsService) {}

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
}
