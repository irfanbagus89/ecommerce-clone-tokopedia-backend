import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RetryCleanupWorker } from './retry-cleanup.worker';

@Injectable()
export class RetryCleanupCron {
  constructor(private readonly worker: RetryCleanupWorker) {}

  @Cron('0 3 * * *') // jam 3 pagi tiap hari
  async handle() {
    await this.worker.run();
  }
}
