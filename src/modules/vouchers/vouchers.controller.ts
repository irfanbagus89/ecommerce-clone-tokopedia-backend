import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles, CurrentUser } from 'src/common';
import { ApplyVoucherDto, CreateVoucherDto } from './dto/voucher.dto';

@Controller({ path: 'vouchers', version: '1' })
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Get('validate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  validateVoucher(
    @Query('code') code: string,
    @Query('total') total: number,
    @CurrentUser('sub') userId: string,
  ) {
    return this.vouchersService.validateVoucher(code, userId, Number(total));
  }

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createVoucher(@Body() dto: CreateVoucherDto) {
    return this.vouchersService.createVoucher(dto);
  }

  @Get()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  getVouchers(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('active') active?: string,
  ) {
    const isActive = active === undefined ? undefined : active === 'true';
    return this.vouchersService.getVouchers(
      Number(page),
      Number(limit),
      isActive,
    );
  }

  @Patch(':id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  toggleVoucher(
    @Param('id', new ParseUUIDPipe({ version: '4' })) voucherId: string,
    @Body() body: { is_active: boolean },
  ) {
    return this.vouchersService.toggleVoucher(voucherId, body.is_active);
  }
}
