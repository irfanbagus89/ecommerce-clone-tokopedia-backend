import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponse, Profile } from './interface/auth-response.interface';
import { BcryptUtil } from './bycrypt.utils';
import { Pool } from 'pg';
import { ConfigService } from 'src/common/config/config.service';

interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject('PG_POOL') private db: Pool,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async register(data: RegisterDto): Promise<AuthResponse> {
    const { rows } = await this.db.query<User>(
      'SELECT * FROM "users" WHERE email = $1',
      [data.email],
    );
    const existingUser = rows[0];
    if (existingUser) throw new ConflictException('Email sudah terdaftar');

    if (data.password.length < 8)
      throw new BadRequestException('Password minimal 8 karakter');

    const hash = await BcryptUtil.hashPassword(data.password);

    const insertResult = await this.db.query<User>(
      'INSERT INTO "users" (email, name, "password") VALUES ($1, $2, $3) RETURNING id, email, name, role',
      [data.email, data.name, hash],
    );

    const user = insertResult.rows[0];
    return this.signToken(user.id, user.email, user.name, user.role);
  }

  async login(data: LoginDto): Promise<AuthResponse> {
    const { rows } = await this.db.query<User>(
      'SELECT * FROM "users" WHERE email = $1',
      [data.email],
    );
    const user = rows[0];
    if (!user) throw new UnauthorizedException('Email tidak ditemukan');

    const valid = await BcryptUtil.comparePassword(
      data.password,
      user.password,
    );
    if (!valid) throw new UnauthorizedException('Password salah');

    return this.signToken(user.id, user.email, user.name, user.role);
  }

  async profile(userId: string): Promise<Profile> {
    const { rows } = await this.db.query<User>(
      'SELECT id, email, name FROM "users" WHERE id = $1',
      [userId],
    );
    const user = rows[0];
    if (!user) throw new UnauthorizedException('User tidak ditemukan');
    return user;
  }

  async signToken(
    userId: string,
    email: string,
    name?: string,
    role?: string,
  ): Promise<AuthResponse> {
    const payload = { userId, email, role };
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not defined');

    const token = await this.jwtService.signAsync(payload, {
      secret: secret,
      expiresIn: this.config.jwtExpiresIn,
    });

    return {
      access_token: token,
      expires_in: this.config.jwtExpiresIn,
      user: { email, name: name || '', role: role || '' },
    };
  }
}
