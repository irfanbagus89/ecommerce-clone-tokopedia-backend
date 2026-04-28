import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common';

@Controller({ path: 'chat', version: '1' })
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @HttpCode(200)
  getConversations(@CurrentUser('sub') userId: string) {
    return this.chatService.getConversations(userId);
  }

  @Get('conversations/:id/messages')
  @HttpCode(200)
  getMessages(
    @Param('id', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @CurrentUser('sub') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 30,
  ) {
    return this.chatService.getMessages(
      conversationId,
      userId,
      Number(page),
      Number(limit),
    );
  }

  @Post('conversations')
  @HttpCode(200)
  startConversation(
    @CurrentUser('sub') buyerId: string,
    @Body() body: { seller_id: string; product_id?: string },
  ) {
    return this.chatService.startOrGetConversation(
      buyerId,
      body.seller_id,
      body.product_id,
    );
  }

  @Post('conversations/:id/messages')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('image'))
  sendMessage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @CurrentUser('sub') senderId: string,
    @Body() body: { message?: string },
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.chatService.sendMessage(
      conversationId,
      senderId,
      body.message,
      image,
    );
  }

  @Get('unread-count')
  @HttpCode(200)
  getUnreadCount(@CurrentUser('sub') userId: string) {
    return this.chatService.getUnreadCount(userId);
  }

  @Delete('conversations/:id')
  @HttpCode(200)
  deleteConversation(
    @Param('id', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.chatService.deleteConversation(conversationId, userId);
  }
}
