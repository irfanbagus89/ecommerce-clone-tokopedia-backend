import { Module } from '@nestjs/common';
import { IntentparserService } from './intentparser.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [IntentparserService],
  exports: [IntentparserService],
})
export class IntentParserModule {}
