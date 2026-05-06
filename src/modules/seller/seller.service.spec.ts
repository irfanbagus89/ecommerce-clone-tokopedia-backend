import { Test, TestingModule } from '@nestjs/testing';
import { SellerService } from './seller.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

describe('SellerService', () => {
  let service: SellerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SellerService,
        { provide: 'DATABASE_POOL', useValue: mockDb },
      ],
    }).compile();
    service = module.get<SellerService>(SellerService);
  });
  describe('deleteProduct', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.deleteProduct('p1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if product not found or does not belong to seller', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [] });
      await expect(service.deleteProduct('p1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should soft delete product', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await service.deleteProduct('p1', 'user1');
      expect(result).toHaveProperty('message');
    });
  });
  describe('updateStock', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.updateStock('p1', 'user1', { variants: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if product not found', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [] });
      await expect(
        service.updateStock('p1', 'user1', { variants: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update stock for variants', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p1' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await service.updateStock('p1', 'user1', {
        variants: [{ variant_id: 'v1', stock: 10 }],
      });
      expect(result).toHaveProperty('message');
    });
  });
  describe('updateSellerProfile', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.updateSellerProfile('user1', { store_name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if no fields to update', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 's1' }] });
      await expect(service.updateSellerProfile('user1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should update seller profile', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await service.updateSellerProfile('user1', {
        store_name: 'New Store',
      });
      expect(result).toHaveProperty('message');
    });
  });
  describe('updateProduct', () => {
    it('should throw NotFoundException if seller not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const dto = { name: 'New Name' };
      await expect(
        service.updateProduct('p1', 'user1', dto as any, {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if product not found', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [] });
      await expect(
        service.updateProduct('p1', 'user1', { name: 'X' } as any, {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if no fields to update', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 's1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'p1' }] });
      await expect(
        service.updateProduct('p1', 'user1', {} as any, {} as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
