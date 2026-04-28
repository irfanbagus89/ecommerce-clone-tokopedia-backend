import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common';

@Controller({ path: 'notifications', version: '1' })
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @HttpCode(200)
  getNotifications(
    @CurrentUser('sub') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('unread') unread?: string,
  ) {
    return this.notificationsService.getNotifications(
      userId,
      Number(page),
      Number(limit),
      unread === 'true',
    );
  }

  @Get('count')
  @HttpCode(200)
  getUnreadCount(@CurrentUser('sub') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Patch(':id/read')
  @HttpCode(200)
  markAsRead(
    @Param('id', new ParseUUIDPipe({ version: '4' })) notificationId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.notificationsService.markAsRead(notificationId, userId);
  }

  @Patch('read-all')
  @HttpCode(200)
  markAllAsRead(@CurrentUser('sub') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Delete(':id')
  @HttpCode(200)
  deleteNotification(
    @Param('id', new ParseUUIDPipe({ version: '4' })) notificationId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.notificationsService.deleteNotification(notificationId, userId);
  }
}
