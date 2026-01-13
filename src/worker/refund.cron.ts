import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RefundWorker } from './refund.worker';

@Injectable()
export class RefundCron {
  constructor(private readonly worker: RefundWorker) {}

  @Cron('*/5 * * * *') // tiap 5 menit
  async handle() {
    await this.worker.run();
  }
}
