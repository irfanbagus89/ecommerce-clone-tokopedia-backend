import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExpiredOrderWorker } from './expired-order.worker';

@Injectable()
export class ExpiredOrderCron {
  constructor(private readonly worker: ExpiredOrderWorker) {}

  @Cron('*/1 * * * *') // tiap 1 menit
  async handle() {
    await this.worker.run();
  }
}
