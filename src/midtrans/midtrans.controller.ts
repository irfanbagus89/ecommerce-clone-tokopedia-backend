import { Controller, Post, Body, Headers } from '@nestjs/common';
import { MidtransService } from './midtrans.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { MidtransWebhookDto } from './dto/webhook.dto';

@Controller('payments')
export class MidtransController {
  constructor(private readonly midtransService: MidtransService) {}

  @Post('create')
  async createPayment(@Body() dto: CreatePaymentDto) {
    return this.midtransService.createPayment(dto);
  }

  @Post('webhook')
  async handleWebhook(
    @Body() body: MidtransWebhookDto,
    @Headers('x-midtrans-signature-key') signatureKey: string,
  ) {
    return this.midtransService.handleWebhook(body, signatureKey);
  }
}
