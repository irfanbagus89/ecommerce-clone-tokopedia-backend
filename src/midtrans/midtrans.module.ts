import { Module } from '@nestjs/common';
import { MidtransService } from './midtrans.service';
import { MidtransController } from './midtrans.controller';
import { ConfigModule } from 'src/common/config/config.module';

@Module({
  imports: [ConfigModule],
  providers: [MidtransService],
  controllers: [MidtransController],
})
export class MidtransModule {}
