import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SellerService } from './seller.service';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from 'src/auth/jwt.strategy';
import { JwtAuthGuard } from 'src/auth/jwt.guard';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller('seller')
export class SellerController {
  constructor(private sellerService: SellerService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  register(@Body() dto: RegisterDto, @Req() req: AuthenticatedRequest) {
    return this.sellerService.registerSeller(dto, req.user.userId);
  }

  @Get(':id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  getStore(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.sellerService.getStore(id);
  }
}
