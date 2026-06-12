import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { JwtPayloadCreate } from '../../common/decorators';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { hashPassword, verifyPassword } from 'src/common';
import { CloudinaryService } from 'src/common';
import { GoogleProfile } from './strategies/google.strategy';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @Inject('DATABASE_POOL') private db: Pool,
    @Optional() private readonly cloudinary?: CloudinaryService,
  ) {}

  async register(data: RegisterDto): Promise<{
    email: string;
    name: string;
    role: string;
  }> {
    const { rows } = await this.db.query<{
      id: string;
      email: string;
      name: string;
      password: string;
      role: string;
    }>('SELECT * FROM "users" WHERE email = $1', [data.email]);
    const existingUser = rows[0];
    if (existingUser) throw new ConflictException('Email sudah terdaftar');

    if (data.password.length < 8)
      throw new BadRequestException('Password minimal 8 karakter');

    const hash = await hashPassword(data.password);

    const insertResult = await this.db.query<{
      id: string;
      email: string;
      name: string;
      password: string;
      role: string;
    }>(
      'INSERT INTO "users" (email, name, "password") VALUES ($1, $2, $3) RETURNING id, email, name, role',
      [data.email, data.name, hash],
    );

    const user = insertResult.rows[0];

    return {
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async login(loginDto: LoginDto): Promise<{
    access_token: string;
    user: {
      id: string;
      email: string;
      role: string;
    };
  }> {
    const userResult = await this.db.query<{
      id: string;
      email: string;
      password: string;
      role: string;
    }>('SELECT id, email, password, role FROM users WHERE email = $1', [
      loginDto.email,
    ]);

    if (userResult.rows.length === 0) {
      throw new UnauthorizedException('Email atau password salah');
    }

    const user = userResult.rows[0];

    const isPasswordValid = await verifyPassword(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email atau password salah');
    }

    const accessToken = this.generateAccessToken(
      user.id,
      user.email,
      user.role,
    );

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async profile(userId: string): Promise<{
    id: string;
    name: string;
    email: string;
    role: string;
    avatar: string | null;
  }> {
    const { rows } = await this.db.query<{
      id: string;
      email: string;
      name: string;
      role: string;
      avatar: string | null;
    }>('SELECT id, email, name, role, avatar FROM users WHERE id = $1', [
      userId,
    ]);
    const user = rows[0];
    if (!user) throw new UnauthorizedException('User tidak ditemukan');
    return user;
  }

  async updateProfile(
    userId: string,
    name: string | undefined,
    avatarFile: Express.Multer.File | undefined,
  ) {
    const userRes = await this.db.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1`,
      [userId],
    );
    if (!userRes.rows[0]) throw new NotFoundException('User not found');

    const setParts: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (name !== undefined) {
      setParts.push(`name = $${idx++}`);
      params.push(name);
    }

    if (avatarFile) {
      if (!this.cloudinary) {
        throw new BadRequestException('Cloudinary service is not available');
      }
      const uploaded = await this.cloudinary.uploadImage(
        avatarFile,
        'avatars',
        `avatar-${userId}`,
      );
      setParts.push(`avatar = $${idx++}`);
      params.push(uploaded.secure_url);

      const hasPublicIdColumn = await this.hasColumn(
        'users',
        'avatar_public_id',
      );
      if (hasPublicIdColumn) {
        setParts.push(`avatar_public_id = $${idx++}`);
        params.push(uploaded.public_id);
      }
    }

    if (setParts.length === 0) {
      throw new BadRequestException('No fields to update');
    }

    setParts.push(`updated_at = NOW()`);
    params.push(userId);

    await this.db.query(
      `UPDATE users SET ${setParts.join(', ')} WHERE id = $${idx}`,
      params,
    );

    return { message: 'Profile updated successfully' };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ) {
    const userRes = await this.db.query<{ id: string; password: string }>(
      `SELECT id, password FROM users WHERE id = $1`,
      [userId],
    );
    const user = userRes.rows[0];
    if (!user) throw new NotFoundException('User not found');

    const isValid = await verifyPassword(oldPassword, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Old password is incorrect');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException(
        'New password must be at least 8 characters',
      );
    }

    const hashed = await hashPassword(newPassword);
    await this.db.query(
      `UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2`,
      [hashed, userId],
    );

    return { message: 'Password changed successfully' };
  }

  async loginWithGoogle(googleProfile: GoogleProfile): Promise<{
    access_token: string;
    user: { id: string; email: string; role: string };
  }> {
    const { rows } = await this.db.query<{
      id: string;
      email: string;
      role: string;
    }>('SELECT id, email, role FROM users WHERE email = $1', [
      googleProfile.email,
    ]);

    let user = rows[0];

    if (!user) {
      const insertResult = await this.db.query<{
        id: string;
        email: string;
        role: string;
      }>(
        `INSERT INTO users (email, name, avatar, password)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, role`,
        [googleProfile.email, googleProfile.name, googleProfile.avatar, ''],
      );
      user = insertResult.rows[0];
    }

    const accessToken = this.generateAccessToken(
      user.id,
      user.email,
      user.role,
    );

    return {
      access_token: accessToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  private generateAccessToken(
    userId: string,
    email: string,
    role: string,
  ): string {
    const payload: JwtPayloadCreate = {
      sub: userId,
      email,
      role: role,
    };

    return this.jwtService.sign(payload);
  }

  private async hasColumn(tableName: string, columnName: string) {
    const result = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = $2
       )`,
      [tableName, columnName],
    );

    return result.rows[0]?.exists ?? false;
  }
}
