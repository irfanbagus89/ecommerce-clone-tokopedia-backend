import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';

const mockDb = {
  query: jest.fn(),
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock-token'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'DATABASE_POOL', useValue: mockDb },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── register ─────────────────────────────────────────────────────────────
  describe('register', () => {
    it('should throw ConflictException if email already exists', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'u1', email: 'a@b.com' }],
      });
      await expect(
        service.register({
          name: 'A',
          email: 'a@b.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if password too short', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // email not found
      await expect(
        service.register({ name: 'A', email: 'a@b.com', password: '123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return registered user data on success', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // email check
        .mockResolvedValueOnce({
          rows: [{ id: 'u1', email: 'a@b.com', name: 'A', role: 'user' }],
        }); // insert

      const result = await service.register({
        name: 'A',
        email: 'a@b.com',
        password: 'password123',
      });
      expect(result).toHaveProperty('email', 'a@b.com');
      expect(result).toHaveProperty('role', 'user');
    });
  });

  // ─── login ────────────────────────────────────────────────────────────────
  describe('login', () => {
    it('should throw UnauthorizedException if user not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.login({ email: 'x@x.com', password: 'abc12345' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── profile ──────────────────────────────────────────────────────────────
  describe('profile', () => {
    it('should return user profile', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'u1', name: 'A', email: 'a@b.com', role: 'user', avatar: null },
        ],
      });
      const result = await service.profile('u1');
      expect(result).toHaveProperty('id', 'u1');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.profile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── changePassword ───────────────────────────────────────────────────────
  describe('changePassword', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.changePassword('u1', 'old', 'newpassword123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateProfile ────────────────────────────────────────────────────────
  describe('updateProfile', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.updateProfile('u1', 'New Name', undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if no fields provided', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'u1' }] }); // user found
      await expect(
        service.updateProfile('u1', undefined, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update name successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'u1' }] }) // user found
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update
      const result = await service.updateProfile('u1', 'New Name', undefined);
      expect(result).toHaveProperty('message');
    });
  });
});
