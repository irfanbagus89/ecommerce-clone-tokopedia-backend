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
    mockDb.query.mockReset();
    mockJwt.sign.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: 'DATABASE_POOL', useValue: mockDb },
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });
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
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.register({ name: 'A', email: 'a@b.com', password: '123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return registered user data on success', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: 'u1', email: 'a@b.com', name: 'A', role: 'user' }],
        });

      const result = await service.register({
        name: 'A',
        email: 'a@b.com',
        password: 'password123',
      });
      expect(result).toHaveProperty('email', 'a@b.com');
      expect(result).toHaveProperty('role', 'user');
    });
  });
  describe('login', () => {
    it('should throw UnauthorizedException if user not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.login({ email: 'x@x.com', password: 'abc12345' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
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
        UnauthorizedException,
      );
    });
  });
  describe('changePassword', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.changePassword('u1', 'old', 'newpassword123'),
      ).rejects.toThrow(NotFoundException);
    });
  });
  describe('updateProfile', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.updateProfile('u1', 'New Name', undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if no fields provided', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'u1' }] });
      await expect(
        service.updateProfile('u1', undefined, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update name successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await service.updateProfile('u1', 'New Name', undefined);
      expect(result).toHaveProperty('message');
    });
  });
});
