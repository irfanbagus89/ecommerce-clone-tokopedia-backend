import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@Controller({ path: 'addresses', version: '1' })
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @HttpCode(200)
  getAddresses(@CurrentUser('sub') userId: string) {
    return this.addressesService.getAddresses(userId);
  }
  @Post()
  @HttpCode(201)
  createAddress(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addressesService.createAddress(userId, dto);
  }

  @Get('province')
  getProvince() {
    return this.addressesService.getProvince();
  }

  @Get('city/:provinceId')
  getCity(@Param('provinceId') provinceId: string) {
    return this.addressesService.getCity(provinceId);
  }

  @Get('kecamatan/:cityId')
  getKecamatan(@Param('cityId') cityId: string) {
    return this.addressesService.getKecamatan(cityId);
  }

  @Get('kelurahan/:kecamatanId')
  getKelurahan(@Param('kecamatanId') kecamatanId: string) {
    return this.addressesService.getKelurahan(kecamatanId);
  }

  @Patch(':id')
  @HttpCode(200)
  updateAddress(
    @Param('id', new ParseUUIDPipe({ version: '4' })) addressId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.updateAddress(addressId, userId, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  deleteAddress(
    @Param('id', new ParseUUIDPipe({ version: '4' })) addressId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.addressesService.deleteAddress(addressId, userId);
  }

  @Patch(':id/set-default')
  @HttpCode(200)
  setDefaultAddress(
    @Param('id', new ParseUUIDPipe({ version: '4' })) addressId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.addressesService.setDefaultAddress(addressId, userId);
  }

  @Get('default')
  @HttpCode(200)
  getDefaultAddress(@CurrentUser('sub') userId: string) {
    return this.addressesService.getDefaultAddress(userId);
  }
}
