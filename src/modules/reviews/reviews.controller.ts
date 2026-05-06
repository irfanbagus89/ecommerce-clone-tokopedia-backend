import {
  Body,
  Controller,
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
import { FilesInterceptor } from '@nestjs/platform-express';
import { ReviewsService } from './reviews.service';
import { BasicAuthGuard } from 'src/common/guards/basic-auth.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common';
import { CreateReviewDto } from './dto/create-review.dto';

@Controller({ path: 'reviews', version: '1' })
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  createReview(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(
      userId,
      dto.order_id,
      dto.product_id,
      dto.rating,
      dto.variant_id,
      dto.comment,
    );
  }

  @Post(':id/images')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('images', 5))
  uploadReviewImages(
    @Param('id', new ParseUUIDPipe({ version: '4' })) reviewId: string,
    @CurrentUser('sub') userId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.reviewsService.uploadReviewImages(reviewId, userId, files);
  }

  @Post(':id/helpful')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  markHelpful(
    @Param('id', new ParseUUIDPipe({ version: '4' })) reviewId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reviewsService.markHelpful(reviewId, userId);
  }
  @Get(':id')
  @HttpCode(200)
  @UseGuards(BasicAuthGuard)
  getReviewsById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('sort') sort: string = 'helpful',
    @Query('rating') rating: number[] | null = null,
    @Query('withMedia') withMedia: boolean = false,
  ) {
    return this.reviewsService.getReviewsById(
      id,
      page,
      limit,
      sort,
      rating,
      withMedia,
    );
  }
}
