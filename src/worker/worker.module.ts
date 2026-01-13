import { Module } from '@nestjs/common';
import { ExpiredOrderWorker } from './expired-order.worker';
import { ExpiredOrderCron } from './expired-order.cron';
import { RetryCleanupCron } from './retry-cleanup.cron';
import { ShippingReminderCron } from './shipping-reminder.cron';
import { RefundCron } from './refund.cron';
import { SettlementCron } from './settlement.cron';
import { RetryCleanupWorker } from './retry-cleanup.worker';
import { ShippingReminderWorker } from './shipping-reminder.worker';
import { RefundWorker } from './refund.worker';
import { SettlementWorker } from './settlement.worker';

@Module({
  providers: [
    ExpiredOrderWorker,
    SettlementWorker,
    RefundWorker,
    ShippingReminderWorker,
    RetryCleanupWorker,

    // Crons
    ExpiredOrderCron,
    SettlementCron,
    RefundCron,
    ShippingReminderCron,
    RetryCleanupCron,
  ],
})
export class WorkerModule {}
