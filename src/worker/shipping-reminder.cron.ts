import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ShippingReminderWorker } from './shipping-reminder.worker';

@Injectable()
export class ShippingReminderCron {
  constructor(private readonly worker: ShippingReminderWorker) {}

  @Cron('0 */6 * * *') // tiap 6 jam
  async handle() {
    await this.worker.run();
  }
}
