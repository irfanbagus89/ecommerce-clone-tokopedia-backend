import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ShippingService } from '../shipping/shipping.service';
import { VouchersService } from '../vouchers/vouchers.service';

const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockShippingService = {
  getServiceCost: jest.fn(),
};

const mockVouchersService = {
  validateVoucher: jest.fn(),
};

describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: 'DATABASE_POOL', useValue: mockDb },
        { provide: ShippingService, useValue: mockShippingService },
        { provide: VouchersService, useValue: mockVouchersService },
      ],
    }).compile();
    service = module.get<OrdersService>(OrdersService);
  });

  describe('getMyOrders', () => {
    it('should return paginated orders for buyer', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'o1', status: 'pending', total_price: '50000' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const result = await service.getMyOrders('user1', undefined, 1, 10);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveLength(1);
    });

    it('should filter by status', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const result = await service.getMyOrders('user1', 'completed', 1, 10);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('getOrderDetail', () => {
    it('should throw NotFoundException if order not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getOrderDetail('o1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return order detail with items and shipping (Promise.all: 4 queries)', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'o1',
              user_id: 'user1',
              status: 'pending',
              total_price: '50000',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'i1', product_name: 'Baju', quantity: 2, price: '25000' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ payment_status: 'paid', snap_token: 'tok' }],
        })
        .mockResolvedValueOnce({
          rows: [{ status: 'pending', tracking_number: null }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 's1', store_name: 'Toko A' }] });
      const result = await service.getOrderDetail('o1', 'user1');
      expect(result).toHaveProperty('id', 'o1');
      expect(result).toHaveProperty('items');
    });
  });

  describe('confirmOrderReceived', () => {
    it('should throw NotFoundException if order not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.confirmOrderReceived('o1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if order not in shipped status', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ status: 'pending' }] });
      await expect(service.confirmOrderReceived('o1', 'user1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should confirm order as received', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ status: 'shipped' }] });
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});
      const result = await service.confirmOrderReceived('o1', 'user1');
      expect(result).toHaveProperty('message');
    });
  });

  describe('cancelOrder', () => {
    it('should throw NotFoundException if order not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.cancelOrder('o1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if order is not in pending status', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ status: 'processing' }] });
      await expect(service.cancelOrder('o1', 'user1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should cancel order successfully', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ status: 'pending' }] });
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ variant_id: 'v1', quantity: 1 }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});
      const result = await service.cancelOrder('o1', 'user1');
      expect(result).toHaveProperty('message');
    });
  });

  describe('getSellerOrders', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.getSellerOrders('user1', undefined, 1, 10),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return paginated seller orders (Promise.all)', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'o1', status: 'pending', total_price: '50000' }],
        })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });
      const result = await service.getSellerOrders('user1', undefined, 1, 10);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('acceptOrder', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.acceptOrder('o1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if order not found', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [] });
      await expect(service.acceptOrder('o1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if payment not paid', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({
          rows: [{ status: 'pending', payment_status: 'pending' }],
        });
      await expect(service.acceptOrder('o1', 'user1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should accept order successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({
          rows: [{ status: 'pending', payment_status: 'paid' }],
        });
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});
      const result = await service.acceptOrder('o1', 'user1');
      expect(result).toHaveProperty('message');
    });
  });

  describe('shipOrder', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.shipOrder('o1', 'user1', 'TRK123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if order not found', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [] });
      await expect(service.shipOrder('o1', 'user1', 'TRK123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if order not in processing status', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'pending' }] });
      await expect(service.shipOrder('o1', 'user1', 'TRK123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should ship order successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [{ status: 'processing' }] });
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});
      const result = await service.shipOrder('o1', 'user1', 'TRK123');
      expect(result).toHaveProperty('tracking_number', 'TRK123');
    });
  });

  describe('getOrderHistory', () => {
    it('should throw NotFoundException if order not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getOrderHistory('o1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user has no access', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ user_id: 'other', seller_user_id: 'another' }],
      });
      await expect(service.getOrderHistory('o1', 'user1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return order history for buyer', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user1', seller_user_id: 'seller1' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'h1', status: 'pending', created_at: new Date() }],
        });
      const result = await service.getOrderHistory('o1', 'user1');
      expect(result).toHaveProperty('history');
    });
  });
});
