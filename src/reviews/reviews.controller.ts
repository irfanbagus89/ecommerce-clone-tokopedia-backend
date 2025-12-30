import { Controller, Get, HttpCode, Param, Query } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get(':id')
  @HttpCode(200)
  getReviewsById(
    @Param('id') id: string = '',
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
