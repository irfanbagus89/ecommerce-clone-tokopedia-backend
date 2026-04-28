import { Test, TestingModule } from '@nestjs/testing';
import { WishlistsService } from './wishlists.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

const mockDb = { query: jest.fn() };

describe('WishlistsService', () => {
  let service: WishlistsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WishlistsService,
        { provide: 'DATABASE_POOL', useValue: mockDb },
      ],
    }).compile();
    service = module.get<WishlistsService>(WishlistsService);
  });

  // ─── getWishlists ─────────────────────────────────────────────────────────
  describe('getWishlists', () => {
    it('should return paginated wishlist', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'w1',
              name: 'Produk A',
              original_price: '50000',
              price: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });
      const result = await service.getWishlists('user1', 1, 10);
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveLength(1);
      expect(result).toHaveProperty('total', 1);
    });
  });

  // ─── addToWishlist ────────────────────────────────────────────────────────
  describe('addToWishlist', () => {
    it('should throw NotFoundException if product not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.addToWishlist('user1', 'prod1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if already in wishlist', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'prod1' }] }) // product exists
        .mockResolvedValueOnce({ rows: [{ id: 'w1' }] }); // already in wishlist
      await expect(service.addToWishlist('user1', 'prod1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should add product to wishlist', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'prod1' }] }) // product exists
        .mockResolvedValueOnce({ rows: [] }) // not in wishlist yet
        .mockResolvedValueOnce({ rows: [] }); // INSERT
      const result = await service.addToWishlist('user1', 'prod1');
      expect(result).toHaveProperty('message');
    });
  });

  // ─── removeFromWishlist ───────────────────────────────────────────────────
  describe('removeFromWishlist', () => {
    it('should throw NotFoundException if item not in wishlist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(
        service.removeFromWishlist('user1', 'prod1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should remove item from wishlist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await service.removeFromWishlist('user1', 'prod1');
      expect(result).toHaveProperty('message');
    });
  });

  // ─── checkWishlist ────────────────────────────────────────────────────────
  describe('checkWishlist', () => {
    it('should return false if not in wishlist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.checkWishlist('user1', 'prod1');
      // service returns { is_wishlisted: bool }
      expect(result).toHaveProperty('is_wishlisted', false);
    });

    it('should return true if in wishlist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'w1' }] });
      const result = await service.checkWishlist('user1', 'prod1');
      expect(result).toHaveProperty('is_wishlisted', true);
    });
  });
});
