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

  // ─── getDashboard ─────────────────────────────────────────────────────────
  describe('getDashboard', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getDashboard('user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return dashboard stats', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] }) // seller
        .mockResolvedValueOnce({ rows: [{ status: 'pending', count: '3' }] }) // orders by status
        .mockResolvedValueOnce({ rows: [{ total: '1500000' }] }) // revenue
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // active products
        .mockResolvedValueOnce({
          rows: [
            {
              available_balance: '500000',
              pending_balance: '200000',
              total_earned: '2000000',
            },
          ],
        }); // balance

      const result = await service.getDashboard('user1');
      expect(result).toHaveProperty('order_stats');
      expect(result).toHaveProperty('total_revenue');
      expect(result).toHaveProperty('balance');
    });
  });

  // ─── getBalance ───────────────────────────────────────────────────────────
  describe('getBalance', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getBalance('user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return balance data', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] }) // seller
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
        }); // balance
      const result = await service.getBalance('user1');
      expect(result).toHaveProperty('available_balance', 500000);
    });

    it('should return zeros if no balance record', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [] }); // no balance record
      const result = await service.getBalance('user1');
      expect(result).toHaveProperty('available_balance', 0);
    });
  });

  // ─── requestWithdrawal ────────────────────────────────────────────────────
  describe('requestWithdrawal', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.requestWithdrawal('user1', 100000, 'BCA', '123', 'Ali'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if balance insufficient', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] }) // seller
        .mockResolvedValueOnce({ rows: [{ available_balance: '50000' }] }); // balance
      await expect(
        service.requestWithdrawal('user1', 100000, 'BCA', '123', 'Ali'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create withdrawal request', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] }) // seller
        .mockResolvedValueOnce({ rows: [{ available_balance: '500000' }] }) // balance
        .mockResolvedValueOnce({ rows: [{ id: 'w1' }] }); // insert
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

  // ─── getMyWithdrawals ─────────────────────────────────────────────────────
  describe('getMyWithdrawals', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getMyWithdrawals('user1', 1, 10)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return paginated withdrawals', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] }) // seller
        .mockResolvedValueOnce({
          rows: [{ id: 'w1', amount: '100000', status: 'pending' }],
        }) // withdrawals
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // total
      const result = await service.getMyWithdrawals('user1', 1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].amount).toBe(100000);
    });
  });
});
