import { Injectable, Logger } from '@nestjs/common';
import { ToolRegistryService } from './services/tool-registry.service';
import { GlmService, GLMMessage, GLMTool } from './services/glm.service';
import { SellerService } from '../seller/seller.service';
import { ProductsService } from '../products/products.service';
import { OrdersService } from '../orders/orders.service';
import {
  AgentResponse,
  AgentConfig,
} from './interfaces/agent-response.interface';
import { UpdateConfigDto } from './dto/prompt.dto';

@Injectable()
export class AiagentService {
  private readonly logger = new Logger(AiagentService.name);
  private config: AgentConfig = {
    maxIterations: 5,
    temperature: 0.7,
    model: 'glm-4',
  };

  constructor(
    private toolRegistry: ToolRegistryService,
    private glmService: GlmService,
    private sellerService: SellerService,
    private productsService: ProductsService,
    private ordersService: OrdersService,
  ) {
    this.registerToolExecutors();
  }

  private registerToolExecutors(): void {
    this.toolRegistry.registerExecutor(
      'get_seller_products',
      async (params: Record<string, unknown>, userId?: string) => {
        try {
          const result = await this.sellerService.getMyProductsSeller(
            userId!,
            (params.page as number) ?? 1,
            (params.limit as number) ?? 10,
            params.search as string | undefined,
            (params.sortBy as 'name' | 'price' | 'active') ?? 'name',
            (params.sortOrder as 'asc' | 'desc') ?? 'asc',
          );
          return {
            success: true,
            data: result,
            toolName: 'get_seller_products',
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            toolName: 'get_seller_products',
          };
        }
      },
    );

    this.toolRegistry.registerExecutor(
      'get_product_detail',
      async (params: Record<string, unknown>) => {
        try {
          const result = await this.productsService.getProductDetail(
            params.productId as string,
          );
          return {
            success: true,
            data: result,
            toolName: 'get_product_detail',
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            toolName: 'get_product_detail',
          };
        }
      },
    );

    this.toolRegistry.registerExecutor(
      'get_products_by_category',
      async (params: Record<string, unknown>) => {
        try {
          const result = await this.productsService.getProductByCategory(
            params.categoryId as string,
            (params.page as number) ?? 1,
            (params.limit as number) ?? 10,
          );
          return {
            success: true,
            data: result,
            toolName: 'get_products_by_category',
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            toolName: 'get_products_by_category',
          };
        }
      },
    );

    this.toolRegistry.registerExecutor(
      'get_checkout_orders',
      async (params: Record<string, unknown>) => {
        try {
          const result = await this.ordersService.getAllCheckoutOrders(
            (params.page as number) ?? 1,
            (params.limit as number) ?? 10,
          );
          return {
            success: true,
            data: result,
            toolName: 'get_checkout_orders',
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            toolName: 'get_checkout_orders',
          };
        }
      },
    );

    this.toolRegistry.registerExecutor(
      'get_seller_statistics',
      async (_params: Record<string, unknown>, userId?: string) => {
        try {
          const products = await this.sellerService.getMyProductsSeller(
            userId!,
            1,
            1000,
          );
          const totalProducts = products.products.length;
          const activeProducts = products.products.filter(
            (p) => p.active,
          ).length;
          const lowStockProducts = products.products.filter(
            (p) => p.stock < 10,
          ).length;

          return {
            success: true,
            data: {
              totalProducts,
              activeProducts,
              inactiveProducts: totalProducts - activeProducts,
              lowStockProducts,
              totalPages: products.totalPages,
            },
            toolName: 'get_seller_statistics',
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            toolName: 'get_seller_statistics',
          };
        }
      },
    );

    this.toolRegistry.registerExecutor(
      'get_product_analytics',
      async (_params: Record<string, unknown>, userId?: string) => {
        try {
          const products = await this.sellerService.getMyProductsSeller(
            userId!,
            1,
            1000,
            undefined,
            'price',
            'desc',
          );

          return {
            success: true,
            data: {
              bestSellers: products.products
                .filter((p) => p.active)
                .slice(0, 5),
              lowStock: products.products
                .filter((p) => p.stock < 10)
                .slice(0, 5),
              inactive: products.products.filter((p) => !p.active).slice(0, 5),
            },
            toolName: 'get_product_analytics',
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            toolName: 'get_product_analytics',
          };
        }
      },
    );

    this.toolRegistry.registerExecutor(
      'get_sales_report',
      async (params: Record<string, unknown>, userId?: string) => {
        try {
          const products = await this.sellerService.getMyProductsSeller(
            userId!,
            1,
            1000,
          );
          return {
            success: true,
            data: {
              period:
                (params.period as 'daily' | 'weekly' | 'monthly') ?? 'daily',
              totalProducts: products.products.length,
              message: 'Laporan penjualan berhasil dibuat',
            },
            toolName: 'get_sales_report',
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            toolName: 'get_sales_report',
          };
        }
      },
    );

    this.toolRegistry.registerExecutor(
      'get_revenue_summary',
      async (_params: Record<string, unknown>, userId?: string) => {
        try {
          const products = await this.sellerService.getMyProductsSeller(
            userId!,
            1,
            1000,
          );

          const totalValue = products.products.reduce(
            (sum, p) => sum + (p.price ?? 0),
            0,
          );

          return {
            success: true,
            data: {
              totalProducts: products.products.length,
              totalValue,
              message: 'Ringkasan pendapatan berhasil dibuat',
            },
            toolName: 'get_revenue_summary',
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            toolName: 'get_revenue_summary',
          };
        }
      },
    );
  }

  async processPrompt(
    prompt: string,
    userId?: string,
    context?: Record<string, any>,
  ): Promise<AgentResponse> {
    if (!this.glmService.isConfigured()) {
      return {
        success: false,
        message: 'GLM API belum dikonfigurasi.',
        reasoning: 'GLM_API_KEY tidak ditemukan',
      };
    }

    const tools = this.toolRegistry.getToolSchemasForOpenAI();
    const systemPrompt = this.glmService.getSellerSystemPrompt();

    const messages: GLMMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          (userId ? `[User ID: ${userId}]\n` : '') +
          prompt +
          (context ? `\n\nKonteks tambahan: ${JSON.stringify(context)}` : ''),
      },
    ];

    return this.processWithGLM(messages, tools, userId);
  }

  private async processWithGLM(
    messages: GLMMessage[],
    tools: GLMTool[],
    userId?: string,
    iteration = 0,
  ): Promise<AgentResponse> {
    if (iteration >= this.config.maxIterations) {
      return {
        success: false,
        message: 'Mencapai batas maksimum iterasi.',
        reasoning: 'Max iterations reached',
      };
    }

    const response = await this.glmService.processPromptWithTools(
      messages,
      tools,
    );

    const assistantMessage = response.choices[0].message;
    messages.push(assistantMessage);

    if (assistantMessage.tool_calls?.length) {
      for (const toolCall of assistantMessage.tool_calls) {
        let toolArgs: Record<string, unknown>;
        try {
          const parsedArgs = JSON.parse(toolCall.function.arguments) as unknown;
          // Validate that parsed result is an object
          if (
            parsedArgs === null ||
            typeof parsedArgs !== 'object' ||
            Array.isArray(parsedArgs)
          ) {
            throw new Error(
              'Invalid tool arguments: expected an object, got ' +
                typeof parsedArgs,
            );
          }
          toolArgs = parsedArgs as Record<string, unknown>;
        } catch (error) {
          this.logger.error(
            `Failed to parse tool arguments for ${toolCall.function.name}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
          // Push error message as tool result
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              success: false,
              error: `Invalid tool arguments: ${
                error instanceof Error ? error.message : 'Unknown error'
              }`,
              toolName: toolCall.function.name,
            }),
          });
          continue;
        }

        const result = await this.toolRegistry.executeTool(
          toolCall.function.name,
          toolArgs,
          userId,
        );

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      return this.processWithGLM(messages, tools, userId, iteration + 1);
    }

    return {
      success: true,
      message: assistantMessage.content ?? '',
      reasoning: 'Respons dari GLM API',
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  getGlmConfigStatus() {
    return this.glmService.getConfigStatus();
  }

  /**
   * Get current agent configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Update agent configuration
   */
  updateConfig(updateConfigDto: UpdateConfigDto): AgentConfig {
    if (updateConfigDto.maxIterations !== undefined) {
      this.config.maxIterations = updateConfigDto.maxIterations;
    }
    if (updateConfigDto.temperature !== undefined) {
      this.config.temperature = updateConfigDto.temperature;
    }
    if (updateConfigDto.model !== undefined) {
      this.config.model = updateConfigDto.model;
    }
    return { ...this.config };
  }
}
