import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from 'src/common';

const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockCloudinary = {
  uploadImage: jest.fn(),
};

describe('ReviewsService', () => {
  let service: ReviewsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
    mockCloudinary.uploadImage.mockResolvedValue({
      secure_url: 'https://res.cloudinary.com/demo/review/a.jpg',
      public_id: 'ecommerce/reviews/a',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: 'DATABASE_POOL', useValue: mockDb },
        { provide: CloudinaryService, useValue: mockCloudinary },
      ],
    }).compile();
    service = module.get<ReviewsService>(ReviewsService);
  });

  // ─── createReview ─────────────────────────────────────────────────────────
  // Signature: createReview(userId, orderId, productId, rating, variantId?, comment?)
  describe('createReview', () => {
    it('should throw NotFoundException if order not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.createReview('user1', 'order1', 'prod1', 5),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if order not completed', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'order1', status: 'pending', user_id: 'user1' }],
      });
      await expect(
        service.createReview('user1', 'order1', 'prod1', 5),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if product not in order', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ status: 'completed' }] }) // order OK
        .mockResolvedValueOnce({ rows: [] }); // product not in order
      await expect(
        service.createReview('user1', 'order1', 'prod1', 5),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if review already exists', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ status: 'completed' }] }) // order OK
        .mockResolvedValueOnce({ rows: [{ id: 'oi1' }] }) // product in order
        .mockResolvedValueOnce({ rows: [{ id: 'r1' }] }); // existing review
      await expect(
        service.createReview('user1', 'order1', 'prod1', 5),
      ).rejects.toThrow(ConflictException);
    });

    it('should create review successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ status: 'completed' }] }) // order OK
        .mockResolvedValueOnce({ rows: [{ id: 'oi1' }] }) // product in order
        .mockResolvedValueOnce({ rows: [] }) // no existing review
        .mockResolvedValueOnce({ rows: [{ id: 'rv1' }] }); // insert review
      const result = await service.createReview(
        'user1',
        'order1',
        'prod1',
        5,
        undefined,
        'Great!',
      );
      expect(result).toHaveProperty('review_id', 'rv1');
    });
  });

  // ─── uploadReviewImages ───────────────────────────────────────────────────
  describe('uploadReviewImages', () => {
    it('should throw NotFoundException if review not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.uploadReviewImages('rv1', 'user1', []),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if review belongs to different user', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'rv1', user_id: 'other' }],
      });
      await expect(
        service.uploadReviewImages('rv1', 'user1', []),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if image limit exceeded', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'rv1', user_id: 'user1' }] }) // review check
        .mockResolvedValueOnce({ rows: [{ count: '4' }] }); // already 4 images
      const files = [
        { originalname: 'a.jpg', buffer: Buffer.from('') },
        { originalname: 'b.jpg', buffer: Buffer.from('') },
      ] as Express.Multer.File[];
      await expect(
        service.uploadReviewImages('rv1', 'user1', files),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upload images successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'rv1', user_id: 'user1' }] }) // review check
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // current count
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // cloudinary_public_id column
        .mockResolvedValueOnce({ rows: [] }); // insert image
      const files = [
        { originalname: 'a.jpg', buffer: Buffer.from('test') },
      ] as Express.Multer.File[];
      const result = await service.uploadReviewImages('rv1', 'user1', files);
      expect(result).toHaveProperty('message');
    });
  });

  // ─── markHelpful ─────────────────────────────────────────────────────────
  describe('markHelpful', () => {
    it('should throw NotFoundException if review does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.markHelpful('rv1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if already voted', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'rv1' }] }) // review exists
        .mockResolvedValueOnce({ rows: [{ id: 'vote1' }] }); // already voted
      await expect(service.markHelpful('rv1', 'user1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should mark review as helpful', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'rv1' }] }) // review exists
        .mockResolvedValueOnce({ rows: [] }); // no existing vote
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // INSERT vote
        .mockResolvedValueOnce({}) // UPDATE helpful_count
        .mockResolvedValueOnce({}); // COMMIT
      const result = await service.markHelpful('rv1', 'user1');
      expect(result).toHaveProperty('message');
    });
  });
});
