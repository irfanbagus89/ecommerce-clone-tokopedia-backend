import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ToolRegistryService } from './services/tool-registry.service';
import { GlmService } from './services/glm.service';
import { ProductsModule } from '../products/products.module';
import { SellerModule } from '../seller/seller.module';
import { OrdersModule } from '../orders/orders.module';
import { AiagentController } from './aiagent.controller';
import { AiagentService } from './aiagent.service';

@Module({
  imports: [ProductsModule, SellerModule, OrdersModule, HttpModule],
  controllers: [AiagentController],
  providers: [AiagentService, ToolRegistryService, GlmService],
  exports: [AiagentService, ToolRegistryService, GlmService],
})
export class AiagentModule {}
