import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { NotFoundException } from '@nestjs/common';

const mockDb = { query: jest.fn() };

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: 'DATABASE_POOL', useValue: mockDb },
      ],
    }).compile();
    service = module.get<NotificationsService>(NotificationsService);
  });
  describe('getNotifications', () => {
    it('should return paginated notifications', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'n1', title: 'Test', is_read: false }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const result = await service.getNotifications('user1', 1, 10, false);
      expect(result).toHaveProperty('data');
      expect(result.total).toBe(1);
    });

    it('should filter by unread when unreadOnly is true', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const result = await service.getNotifications('user1', 1, 10, true);
      expect(result.data).toHaveLength(0);
    });
  });
  describe('markAsRead', () => {
    it('should throw NotFoundException if notification not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(service.markAsRead('n1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should mark notification as read', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'n1' }], rowCount: 1 });
      const result = await service.markAsRead('n1', 'user1');
      expect(result).toHaveProperty('message');
    });
  });
  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 5 });
      const result = await service.markAllAsRead('user1');
      expect(result).toHaveProperty('message');
    });
  });
  describe('deleteNotification', () => {
    it('should throw NotFoundException if notification not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(service.deleteNotification('n1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete notification', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'n1' }], rowCount: 1 });
      const result = await service.deleteNotification('n1', 'user1');
      expect(result).toHaveProperty('message');
    });
  });
  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      const result = await service.getUnreadCount('user1');
      expect(result).toHaveProperty('unread_count', 3);
    });
  });
  describe('sendNotification', () => {
    it('should insert a notification without throwing', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.sendNotification(
          'user1',
          'order_update',
          'Order Updated',
          'Your order has been updated',
          'orderId',
          'order',
        ),
      ).resolves.not.toThrow();
    });
  });
});
