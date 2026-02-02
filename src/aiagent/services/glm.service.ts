import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

/**
 * GLM API Message Interface
 */
export interface GLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: GLMToolCall[];
  tool_call_id?: string;
}

/**
 * GLM Tool Call Interface
 */
export interface GLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * GLM Tool Definition Interface
 */
export interface GLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

/**
 * GLM API Request Interface
 */
export interface GLMRequest {
  model: string;
  messages: GLMMessage[];
  tools?: GLMTool[];
  tool_choice?:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * GLM API Response Interface
 */
export interface GLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: GLMMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * GLM Service
 */
@Injectable()
export class GlmService {
  private readonly logger = new Logger(GlmService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiUrl =
      this.configService.get<string>('GLM_API_URL') ||
      'https://open.bigmodel.cn/api/paas/v4/chat/completions';

    this.apiKey = this.configService.get<string>('GLM_API_KEY') || '';
    this.defaultModel = this.configService.get<string>('GLM_MODEL') || 'glm-4';

    if (!this.apiKey) {
      this.logger.warn(
        'GLM_API_KEY tidak ditemukan dalam environment variables',
      );
    }
  }

  /**
   * Send chat completion request to GLM API
   */
  async chatCompletion(request: GLMRequest): Promise<GLMResponse> {
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      };

      const response = await firstValueFrom(
        this.httpService.post<GLMResponse>(this.apiUrl, request, { headers }),
      );

      return response.data;
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.logger.error(`Error calling GLM API: ${err.message}`);
        throw err;
      }

      this.logger.error('Unknown error calling GLM API');
      throw new Error('Unknown error calling GLM API');
    }
  }

  /**
   * Process prompt with tools (USED BY AGENT)
   */
  async processPromptWithTools(
    messages: GLMMessage[],
    tools: GLMTool[],
  ): Promise<GLMResponse> {
    const request: GLMRequest = {
      model: this.defaultModel,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
    };

    return this.chatCompletion(request);
  }

  /**
   * Get default system prompt for seller dashboard AI
   */
  getSellerSystemPrompt(): string {
    return `Anda adalah asisten AI untuk dashboard seller e-commerce. Tugas Anda adalah membantu seller dengan:
1. Menampilkan informasi produk
2. Memberikan insight penjualan
3. Menganalisis statistik toko
4. Menjawab pertanyaan tentang pesanan

Gunakan tools yang tersedia untuk mendapatkan data yang diperlukan. Jangan membuat data atau informasi yang tidak ada.
Jawab dalam bahasa Indonesia yang jelas dan profesional.

Prinsip keamanan:
- Jangan pernah membuat query SQL secara langsung
- Gunakan hanya tools yang terdaftar
- Validasi parameter sebelum memanggil tool
- Laporkan error dengan jelas jika terjadi`;
  }

  /**
   * Check if GLM API is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get API configuration status
   */
  getConfigStatus(): {
    configured: boolean;
    apiUrl: string;
    model: string;
  } {
    return {
      configured: this.isConfigured(),
      apiUrl: this.apiUrl,
      model: this.defaultModel,
    };
  }
}
