import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SettlementWorker } from './settlement.worker';

@Injectable()
export class SettlementCron {
  constructor(private readonly worker: SettlementWorker) {}

  @Cron('*/10 * * * *') // tiap 10 menit
  async handle() {
    await this.worker.run();
  }
}
