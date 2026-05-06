import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/common/database/database.module';
import { DevController } from './dev.controller';
import { DevService } from './dev.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DevController],
  providers: [DevService],
})
export class DevModule {}
