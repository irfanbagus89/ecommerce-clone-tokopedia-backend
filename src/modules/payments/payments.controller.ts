import { Controller, Get } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('methods')
  async getPaymentMethods() {
    return await this.paymentsService.getPaymentMethods();
  }
}
