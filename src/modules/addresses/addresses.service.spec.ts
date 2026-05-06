import { Test, TestingModule } from '@nestjs/testing';
import { AddressesService } from './addresses.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

describe('AddressesService', () => {
  let service: AddressesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressesService,
        { provide: 'DATABASE_POOL', useValue: mockDb },
      ],
    }).compile();
    service = module.get<AddressesService>(AddressesService);
  });
  describe('getAddresses', () => {
    it('should return list of addresses', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'a1', label: 'Rumah', recipient_name: 'Ali' }],
      });
      const result = await service.getAddresses('user1');
      expect(result).toHaveLength(1);
    });
  });
  describe('createAddress', () => {
    it('should create address successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 'a1' }] })
        .mockResolvedValueOnce({});

      const result = await service.createAddress('user1', {
        recipient_name: 'Ali',
        address: 'Jl. Test 1',
        is_default: false,
      });
      expect(result).toHaveProperty('address_id', 'a1');
    });

    it('should create address with is_default=true and unset others', async () => {
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 'a2' }] })
        .mockResolvedValueOnce({});

      const result = await service.createAddress('user1', {
        recipient_name: 'Bob',
        address: 'Jl. Test 2',
        is_default: true,
      });
      expect(result).toHaveProperty('message');
    });
  });
  describe('updateAddress', () => {
    it('should throw NotFoundException if address not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.updateAddress('a1', 'user1', { label: 'Kantor' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if no fields to update', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'a1' }] });
      mockClient.query.mockResolvedValueOnce({});
      await expect(service.updateAddress('a1', 'user1', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });
  describe('deleteAddress', () => {
    it('should throw NotFoundException if address not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await expect(service.deleteAddress('a1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete address successfully', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await service.deleteAddress('a1', 'user1');
      expect(result).toHaveProperty('message');
    });
  });
  describe('setDefaultAddress', () => {
    it('should throw NotFoundException if address not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.setDefaultAddress('a1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should set address as default', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'a1' }] });
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});
      const result = await service.setDefaultAddress('a1', 'user1');
      expect(result).toHaveProperty('message');
    });
  });
  describe('getDefaultAddress', () => {
    it('should throw NotFoundException if no default address', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getDefaultAddress('user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return default address', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'a1', is_default: true, label: 'Rumah' }],
      });
      const result = await service.getDefaultAddress('user1');
      expect(result).toHaveProperty('id', 'a1');
    });
  });
});
