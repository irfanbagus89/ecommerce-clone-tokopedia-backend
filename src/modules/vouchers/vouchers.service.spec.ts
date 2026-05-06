import { Test, TestingModule } from '@nestjs/testing';
import { VouchersService } from './vouchers.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = { query: jest.fn() };
const makeVoucher = (overrides: Record<string, unknown> = {}) => ({
  id: 'v1',
  code: 'PROMO10',
  is_active: true,
  valid_from: null,
  valid_until: null,
  usage_limit: null,
  used_count: 0,
  min_purchase: '0',
  type: 'percentage',
  value: '10',
  max_discount: '50000',
  per_user_limit: 1,
  ...overrides,
});

describe('VouchersService', () => {
  let service: VouchersService;

  beforeEach(async () => {
    mockDb.query.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VouchersService,
        { provide: 'DATABASE_POOL', useValue: mockDb },
      ],
    }).compile();
    service = module.get<VouchersService>(VouchersService);
  });
  describe('validateVoucher', () => {
    it('should throw NotFoundException if voucher not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.validateVoucher('INVALID', 'user1', 100000),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if minimum purchase not met', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [makeVoucher({ min_purchase: '200000' })],
        })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await expect(
        service.validateVoucher('PROMO10', 'user1', 100000),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if per-user limit exceeded', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [makeVoucher({ per_user_limit: 1 })] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      await expect(
        service.validateVoucher('PROMO10', 'user1', 100000),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return discount for valid percentage voucher', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [makeVoucher()] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const result = await service.validateVoucher('PROMO10', 'user1', 200000);
      expect(result).toHaveProperty('discount');
      expect(result.discount).toBeLessThanOrEqual(50000);
    });

    it('should return discount for nominal voucher', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            makeVoucher({
              type: 'nominal',
              value: '15000',
              max_discount: null,
            }),
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const result = await service.validateVoucher('FLAT15K', 'user1', 100000);
      expect(result.discount).toBe(15000);
    });

    it('should throw BadRequestException if voucher is not yet valid', async () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      mockDb.query
        .mockResolvedValueOnce({ rows: [makeVoucher({ valid_from: future })] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await expect(
        service.validateVoucher('PROMO10', 'user1', 100000),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if voucher has expired', async () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      mockDb.query
        .mockResolvedValueOnce({ rows: [makeVoucher({ valid_until: past })] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await expect(
        service.validateVoucher('PROMO10', 'user1', 100000),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if global usage_limit reached', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [makeVoucher({ usage_limit: 10, used_count: 10 })],
        })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      await expect(
        service.validateVoucher('PROMO10', 'user1', 100000),
      ).rejects.toThrow(BadRequestException);
    });
  });
  describe('createVoucher', () => {
    it('should throw BadRequestException if code already exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'v1' }] });
      await expect(
        service.createVoucher({
          code: 'EXISTING',
          type: 'percentage',
          value: 10,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create voucher successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'v2' }] });
      const result = await service.createVoucher({
        code: 'NEWVOUCHER',
        type: 'nominal',
        value: 20000,
      } as any);
      expect(result).toHaveProperty('voucher_id', 'v2');
    });
  });
  describe('getVouchers', () => {
    it('should return paginated vouchers', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'v1', code: 'PROMO10', value: '10', store_name: null }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const result = await service.getVouchers(1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should return empty list when no vouchers', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const result = await service.getVouchers(1, 10);
      expect(result.data).toHaveLength(0);
    });
  });
  describe('toggleVoucher', () => {
    it('should throw NotFoundException if voucher not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.toggleVoucher('v1', false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should deactivate voucher', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'v1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await service.toggleVoucher('v1', false);
      expect(result).toHaveProperty('message');
    });

    it('should activate voucher', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'v1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await service.toggleVoucher('v1', true);
      expect(result.message).toContain('activated');
    });
  });
});
