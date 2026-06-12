import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

export interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
}

export const isGoogleOAuthConfigured = (configService: ConfigService) =>
  Boolean(
    configService.get<string>('GOOGLE_CLIENT_ID') &&
      configService.get<string>('GOOGLE_CLIENT_SECRET') &&
      configService.get<string>('GOOGLE_CALLBACK_URL'),
  );

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL')!,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      emails?: { value: string }[];
      displayName: string;
      photos?: { value: string }[];
    },
    done: VerifyCallback,
  ): void {
    const googleProfile: GoogleProfile = {
      id: profile.id,
      email: profile.emails?.[0]?.value ?? '',
      name: profile.displayName,
      avatar: profile.photos?.[0]?.value ?? null,
    };
    done(null, googleProfile);
  }
}
