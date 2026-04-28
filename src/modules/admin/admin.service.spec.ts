import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: 'DATABASE_POOL', useValue: mockDb }],
    }).compile();
    service = module.get<AdminService>(AdminService);
  });

  // ─── getDashboard ─────────────────────────────────────────────────────────
  describe('getDashboard', () => {
    it('should return platform statistics', async () => {
      // getDashboard uses Promise.all with 4 queries
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // users
        .mockResolvedValueOnce({ rows: [{ count: '20' }] }) // sellers
        .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // orders
        .mockResolvedValueOnce({ rows: [{ total: '5000000' }] }); // revenue

      const result = await service.getDashboard();
      expect(result).toHaveProperty('totalUsers', 100);
      expect(result).toHaveProperty('totalSellers', 20);
      expect(result).toHaveProperty('totalOrders', 50);
      expect(result).toHaveProperty('totalRevenue', 5000000);
    });
  });

  // ─── getOrders ────────────────────────────────────────────────────────────
  describe('getOrders', () => {
    it('should return paginated orders', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'o1', status: 'pending', total_price: '50000' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const result = await service.getOrders(1, 10);
      expect(result.data).toHaveLength(1);
    });

    it('should filter by status', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const result = await service.getOrders(1, 10, 'completed');
      expect(result.data).toHaveLength(0);
    });
  });

  // ─── getSellers ───────────────────────────────────────────────────────────
  describe('getSellers', () => {
    it('should return paginated sellers', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 's1',
              store_name: 'Toko A',
              total_products: '5',
              verified: true,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const result = await service.getSellers(1, 10);
      expect(result.data).toHaveLength(1);
    });
  });

  // ─── verifySeller ─────────────────────────────────────────────────────────
  describe('verifySeller', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.verifySeller('s1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should verify seller', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] }) // exists
        .mockResolvedValueOnce({ rows: [] }); // update
      const result = await service.verifySeller('s1');
      expect(result).toHaveProperty('message');
    });
    // Note: verifySeller does not check if already verified – it always updates
  });

  // ─── getWithdrawals ───────────────────────────────────────────────────────
  describe('getWithdrawals', () => {
    it('should return all pending withdrawals', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'w1', amount: '100000', status: 'pending' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const result = await service.getWithdrawals(1, 10, 'pending');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].amount).toBe(100000);
    });
  });

  // ─── processWithdrawal ────────────────────────────────────────────────────
  describe('processWithdrawal', () => {
    it('should throw NotFoundException if withdrawal not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.processWithdrawal('w1', 'approved')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if not in pending status', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'w1', status: 'approved', seller_id: 's1', amount: '100000' },
        ],
      });
      await expect(service.processWithdrawal('w1', 'approved')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should process withdrawal successfully', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'w1', status: 'pending', seller_id: 's1', amount: '100000' },
        ],
      });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE withdrawal
        .mockResolvedValueOnce({}) // UPDATE balance
        .mockResolvedValueOnce({}); // COMMIT
      const result = await service.processWithdrawal('w1', 'approved');
      expect(result).toHaveProperty('message');
    });
  });

  // ─── getUsers ─────────────────────────────────────────────────────────────
  describe('getUsers', () => {
    it('should return paginated users', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'u1', name: 'Ali', role: 'user' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const result = await service.getUsers(1, 10);
      expect(result.data).toHaveLength(1);
    });
  });

  // ─── refundOrder ──────────────────────────────────────────────────────────
  describe('refundOrder', () => {
    it('should throw NotFoundException if order not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.refundOrder('o1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if order status not refundable', async () => {
      // status must be 'paid','delivered','completed' to be eligible
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'o1',
            status: 'pending',
            seller_id: 's1',
            seller_earning: null,
          },
        ],
      });
      await expect(service.refundOrder('o1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should refund order successfully', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'o1',
            status: 'paid',
            seller_id: 's1',
            seller_earning: '50000',
          },
        ],
      });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE order
        .mockResolvedValueOnce({ rows: [{ variant_id: 'v1', quantity: 2 }] }) // items
        .mockResolvedValueOnce({}) // UPDATE stock
        .mockResolvedValueOnce({}) // UPDATE balance
        .mockResolvedValueOnce({}) // INSERT history
        .mockResolvedValueOnce({}); // COMMIT
      const result = await service.refundOrder('o1');
      expect(result).toHaveProperty('message');
    });
  });

  // ─── getSellerBalance ─────────────────────────────────────────────────────
  describe('getSellerBalance', () => {
    it('should throw NotFoundException if balance not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getSellerBalance('s1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return seller balance', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            seller_id: 's1',
            store_name: 'Toko A',
            total_earned: '2000000',
            pending_balance: '200000',
            available_balance: '500000',
            withdrawn_total: '1300000',
          },
        ],
      });
      const result = await service.getSellerBalance('s1');
      expect(result).toHaveProperty('available_balance', 500000);
      expect(result).toHaveProperty('total_earned', 2000000);
    });
  });
});
