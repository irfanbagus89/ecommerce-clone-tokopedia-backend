/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class IntentparserService {
  constructor(private readonly http: HttpService) {}

  async parse(query: string) {
    try {
      const response = await firstValueFrom(
        this.http.post(
          'http://127.0.0.1:8080/api/nl/parse',
          { query },
          { timeout: 3000000 },
        ),
      );

      return response.data;
    } catch (error: any) {
      console.error('❌ INTENT PARSER ERROR');
      console.error('message:', error.message);
      console.error('code:', error.code);
      console.error('stack:', error.stack);
      console.error('response:', error.response?.data);
      console.error('status:', error.response?.status);

      throw error;
    }
  }
}
