import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ConfigModule } from 'src/common/config/config.module';
import { IntentParserModule } from 'src/intentparser/intentparser.module';

@Module({
  imports: [ConfigModule, IntentParserModule],
  providers: [ProductsService],
  controllers: [ProductsController],
})
export class ProductsModule {}
