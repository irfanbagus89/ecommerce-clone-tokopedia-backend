import { Test, TestingModule } from '@nestjs/testing';
import { SellerDashboardService } from './seller-dashboard.service';
import { NotFoundException } from '@nestjs/common';

const mockDb = { query: jest.fn() };

describe('SellerDashboardService', () => {
  let service: SellerDashboardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SellerDashboardService,
        { provide: 'DATABASE_POOL', useValue: mockDb },
      ],
    }).compile();
    service = module.get<SellerDashboardService>(SellerDashboardService);
  });
  describe('getDashboard', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getDashboard('user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return dashboard stats', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'pending', count: '3' }] })
        .mockResolvedValueOnce({ rows: [{ total: '1500000' }] })
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              available_balance: '500000',
              pending_balance: '200000',
              total_earned: '2000000',
            },
          ],
        });

      const result = await service.getDashboard('user1');
      expect(result).toHaveProperty('order_stats');
      expect(result).toHaveProperty('total_revenue');
      expect(result).toHaveProperty('balance');
    });
  });
  describe('getBalance', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getBalance('user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return balance data', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              total_earned: '2000000',
              pending_balance: '200000',
              available_balance: '500000',
              withdrawn_total: '1300000',
              updated_at: new Date().toISOString(),
            },
          ],
        });
      const result = await service.getBalance('user1');
      expect(result).toHaveProperty('available_balance', 500000);
    });

    it('should return zeros if no balance record', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await service.getBalance('user1');
      expect(result).toHaveProperty('available_balance', 0);
    });
  });
  describe('requestWithdrawal', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.requestWithdrawal('user1', 100000, 'BCA', '123', 'Ali'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if balance insufficient', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [{ available_balance: '50000' }] });
      await expect(
        service.requestWithdrawal('user1', 100000, 'BCA', '123', 'Ali'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create withdrawal request', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [{ available_balance: '500000' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'w1' }] });
      const result = await service.requestWithdrawal(
        'user1',
        100000,
        'BCA',
        '123456',
        'Ali',
      );
      expect(result).toHaveProperty('withdrawal_id', 'w1');
    });
  });
  describe('getMyWithdrawals', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getMyWithdrawals('user1', 1, 10)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return paginated withdrawals', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'w1', amount: '100000', status: 'pending' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const result = await service.getMyWithdrawals('user1', 1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].amount).toBe(100000);
    });
  });
});
