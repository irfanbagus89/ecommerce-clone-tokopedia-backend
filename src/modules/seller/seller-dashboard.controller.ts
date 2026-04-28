import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SellerDashboardService } from './seller-dashboard.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser, Roles } from 'src/common';

@Controller({ path: 'seller/dashboard', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('seller')
export class SellerDashboardController {
  constructor(
    private readonly sellerDashboardService: SellerDashboardService,
  ) {}

  @Get()
  @HttpCode(200)
  getDashboard(@CurrentUser('sub') userId: string) {
    return this.sellerDashboardService.getDashboard(userId);
  }

  @Get('balance')
  @HttpCode(200)
  getBalance(@CurrentUser('sub') userId: string) {
    return this.sellerDashboardService.getBalance(userId);
  }

  @Post('withdrawals')
  @HttpCode(201)
  requestWithdrawal(
    @CurrentUser('sub') userId: string,
    @Body()
    body: {
      amount: number;
      bank_name: string;
      account_number: string;
      account_name: string;
    },
  ) {
    return this.sellerDashboardService.requestWithdrawal(
      userId,
      body.amount,
      body.bank_name,
      body.account_number,
      body.account_name,
    );
  }

  @Get('withdrawals')
  @HttpCode(200)
  getMyWithdrawals(
    @CurrentUser('sub') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.sellerDashboardService.getMyWithdrawals(
      userId,
      Number(page),
      Number(limit),
    );
  }
}
