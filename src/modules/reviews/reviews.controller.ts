import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { BasicAuthGuard } from 'src/common/guards/basic-auth.guard';

@Controller({ path: 'reviews', version: '1' })
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

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
