import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common';

@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @HttpCode(200)
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('orders')
  @HttpCode(200)
  getOrders(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getOrders(
      Number(page),
      Number(limit),
      status,
      search,
    );
  }

  @Get('sellers')
  @HttpCode(200)
  getSellers(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    return this.adminService.getSellers(Number(page), Number(limit), search);
  }

  @Patch('sellers/:id/verify')
  @HttpCode(200)
  verifySeller(
    @Param('id', new ParseUUIDPipe({ version: '4' })) sellerId: string,
  ) {
    return this.adminService.verifySeller(sellerId);
  }

  @Get('withdrawals')
  @HttpCode(200)
  getWithdrawals(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('status') status?: string,
  ) {
    return this.adminService.getWithdrawals(
      Number(page),
      Number(limit),
      status,
    );
  }

  @Patch('withdrawals/:id')
  @HttpCode(200)
  processWithdrawal(
    @Param('id', new ParseUUIDPipe({ version: '4' })) withdrawalId: string,
    @Body() body: { status: 'approved' | 'rejected' | 'paid'; note?: string },
  ) {
    return this.adminService.processWithdrawal(
      withdrawalId,
      body.status,
      body.note,
    );
  }

  @Get('users')
  @HttpCode(200)
  getUsers(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    return this.adminService.getUsers(
      Number(page),
      Number(limit),
      search,
      role,
    );
  }

  @Patch('orders/:id/refund')
  @HttpCode(200)
  refundOrder(
    @Param('id', new ParseUUIDPipe({ version: '4' })) orderId: string,
  ) {
    return this.adminService.refundOrder(orderId);
  }

  @Get('seller-balance/:sellerId')
  @HttpCode(200)
  getSellerBalance(
    @Param('sellerId', new ParseUUIDPipe({ version: '4' })) sellerId: string,
  ) {
    return this.adminService.getSellerBalance(sellerId);
  }
}
