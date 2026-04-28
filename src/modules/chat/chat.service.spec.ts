import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = { query: jest.fn() };

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatService, { provide: 'DATABASE_POOL', useValue: mockDb }],
    }).compile();
    service = module.get<ChatService>(ChatService);
  });

  // ─── getConversations ─────────────────────────────────────────────────────
  describe('getConversations', () => {
    it('should return list of conversations with mapped unread_count', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'c1',
            unread_count: '3',
            store_name: 'Toko A',
            buyer_name: 'Ali',
          },
        ],
      });
      const result = await service.getConversations('user1');
      expect(result).toHaveLength(1);
      expect(result[0].unread_count).toBe(3);
    });
  });

  // ─── getMessages ──────────────────────────────────────────────────────────
  describe('getMessages', () => {
    it('should throw NotFoundException if conversation not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getMessages('c1', 'user1', 1, 30)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if user has no access', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'c1', buyer_id: 'other', seller_user_id: 'another' }],
      });
      await expect(service.getMessages('c1', 'user1', 1, 30)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return paginated messages', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'c1', buyer_id: 'user1', seller_user_id: 'seller1' }],
        }) // conversation
        .mockResolvedValueOnce({ rows: [{ id: 'm1', message: 'Hello' }] }) // messages
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // mark as read
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // total
      const result = await service.getMessages('c1', 'user1', 1, 30);
      expect(result).toHaveProperty('data');
      expect(result.total).toBe(1);
    });
  });

  // ─── startOrGetConversation ───────────────────────────────────────────────
  describe('startOrGetConversation', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.startOrGetConversation('buyer1', 'seller1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return existing conversation', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'seller1' }] }) // seller exists
        .mockResolvedValueOnce({ rows: [{ id: 'c1' }] }); // existing conv
      const result = await service.startOrGetConversation('buyer1', 'seller1');
      expect(result).toHaveProperty('is_new', false);
    });

    it('should create new conversation', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'seller1' }] }) // seller exists
        .mockResolvedValueOnce({ rows: [] }) // no existing conv
        .mockResolvedValueOnce({ rows: [{ id: 'c2' }] }); // create
      const result = await service.startOrGetConversation('buyer1', 'seller1');
      expect(result).toHaveProperty('is_new', true);
    });
  });

  // ─── sendMessage ──────────────────────────────────────────────────────────
  describe('sendMessage', () => {
    it('should throw NotFoundException if conversation not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.sendMessage('c1', 'user1', 'Hello')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if no message or image', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'c1', buyer_id: 'user1', seller_user_id: 'seller1' }],
      });
      await expect(
        service.sendMessage('c1', 'user1', undefined, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should send message successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'c1', buyer_id: 'user1', seller_user_id: 'seller1' }],
        }) // conv
        .mockResolvedValueOnce({ rows: [{ id: 'm1' }] }) // insert message
        .mockResolvedValueOnce({ rows: [] }); // update conv updated_at
      const result = await service.sendMessage('c1', 'user1', 'Hello!');
      expect(result).toHaveProperty('message_id', 'm1');
    });
  });

  // ─── getUnreadCount ───────────────────────────────────────────────────────
  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      const result = await service.getUnreadCount('user1');
      expect(result).toHaveProperty('unread_count', 5);
    });
  });

  // ─── deleteConversation ───────────────────────────────────────────────────
  describe('deleteConversation', () => {
    it('should throw NotFoundException if conversation not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.deleteConversation('c1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if user has no access', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'c1', buyer_id: 'other', seller_user_id: 'another' }],
      });
      await expect(service.deleteConversation('c1', 'user1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should delete conversation', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'c1', buyer_id: 'user1', seller_user_id: 'seller1' }],
        })
        .mockResolvedValueOnce({ rows: [] });
      const result = await service.deleteConversation('c1', 'user1');
      expect(result).toHaveProperty('message');
    });
  });
});
