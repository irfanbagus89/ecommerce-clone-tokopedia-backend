import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingCostDto } from './dto/shipping-cost.dto';
import { BasicAuthGuard } from 'src/common/guards/basic-auth.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller({ path: 'shipping', version: '1' })
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Post('cost')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  calculateCost(@Body() dto: ShippingCostDto) {
    return this.shippingService.calculateCost(dto);
  }

  @Get('couriers')
  @UseGuards(BasicAuthGuard)
  getCouriers() {
    return this.shippingService.getCouriers();
  }

  @Get('province')
  @UseGuards(BasicAuthGuard)
  getProvinces() {
    return this.shippingService.getProvinces();
  }

  @Get('city')
  @UseGuards(BasicAuthGuard)
  getAllCities() {
    return this.shippingService.getCities();
  }

  @Get('city/:province_id')
  @UseGuards(BasicAuthGuard)
  getCitiesByProvince(@Param('province_id', ParseIntPipe) provinceId: number) {
    return this.shippingService.getCities(provinceId);
  }
}
