import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateDto } from './dto/create.dto';
import { JwtAuthGuard } from 'src/auth/jwt.guard';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateDto) {
    return {
      data: await this.categoriesService.createCategories(dto),
      message: 'Berhasil Membuat Categori',
    };
  }

  @Get()
  @HttpCode(200)
  getAllCategori() {
    return this.categoriesService.getCategories();
  }

  @Get(':id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  getSubCategoriByCategori(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.categoriesService.getSubCategories(id);
  }
}
