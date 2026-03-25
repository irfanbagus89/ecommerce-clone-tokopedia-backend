import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { JwtPayloadCreate } from '../../common/decorators';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { hashPassword, verifyPassword } from 'src/common';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @Inject('DATABASE_POOL') private db: Pool,
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
      },
    };
  }

  async profile(
    userId: string,
  ): Promise<{ id: string; name: string; email: string; role: string }> {
    const { rows } = await this.db.query<{
      id: string;
      email: string;
      name: string;
      password: string;
      role: string;
    }>('SELECT id, email, name, role FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) throw new UnauthorizedException('User tidak ditemukan');
    return user;
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
}
