import { Injectable } from '@nestjs/common';
import {
  ToolSchema,
  ToolExecutionResult,
} from '../interfaces/agent-response.interface';
import { GLMTool } from './glm.service';

/**
 * Tool Registry Service
 * Manages all available tools that the AI Agent can call
 */
@Injectable()
export class ToolRegistryService {
  private tools: Map<string, ToolSchema> = new Map();
  private toolExecutors: Map<
    string,
    (
      params: Record<string, unknown>,
      userId?: string,
    ) => Promise<ToolExecutionResult>
  > = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * Register default tools for seller dashboard
   */
  private registerDefaultTools(): void {
    // Product Tools
    this.registerTool({
      name: 'get_seller_products',
      description:
        'Get all products for a specific seller with pagination, search, and sorting options',
      parameters: [
        {
          name: 'page',
          type: 'number',
          description: 'Page number for pagination',
          required: false,
          default: 1,
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Number of items per page',
          required: false,
          default: 10,
        },
        {
          name: 'search',
          type: 'string',
          description: 'Search term to filter products by name or variant',
          required: false,
        },
        {
          name: 'sortBy',
          type: 'string',
          description: 'Sort by field: name, price, or active',
          required: false,
          default: 'name',
          enum: ['name', 'price', 'active'],
        },
        {
          name: 'sortOrder',
          type: 'string',
          description: 'Sort order: asc or desc',
          required: false,
          default: 'asc',
          enum: ['asc', 'desc'],
        },
      ],
      category: 'products',
      requiresAuth: true,
    });

    this.registerTool({
      name: 'get_product_detail',
      description:
        'Get detailed information about a specific product including variants, ratings, and sales data',
      parameters: [
        {
          name: 'productId',
          type: 'string',
          description: 'Product ID to retrieve details for',
          required: true,
        },
      ],
      category: 'products',
      requiresAuth: false,
    });

    this.registerTool({
      name: 'get_products_by_category',
      description: 'Get products filtered by category with pagination',
      parameters: [
        {
          name: 'categoryId',
          type: 'string',
          description: 'Category ID to filter products',
          required: true,
        },
        {
          name: 'page',
          type: 'number',
          description: 'Page number for pagination',
          required: false,
          default: 1,
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Number of items per page',
          required: false,
          default: 10,
        },
      ],
      category: 'products',
      requiresAuth: false,
    });

    // Order Tools
    this.registerTool({
      name: 'get_checkout_orders',
      description: 'Get all checkout orders with pagination',
      parameters: [
        {
          name: 'page',
          type: 'number',
          description: 'Page number for pagination',
          required: false,
          default: 1,
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Number of items per page',
          required: false,
          default: 10,
        },
      ],
      category: 'orders',
      requiresAuth: true,
    });

    // Statistics Tools
    this.registerTool({
      name: 'get_seller_statistics',
      description:
        'Get comprehensive statistics for a seller including total products, sales, revenue, and performance metrics',
      parameters: [],
      category: 'statistics',
      requiresAuth: true,
    });

    this.registerTool({
      name: 'get_product_analytics',
      description:
        'Get analytics data for products including best sellers, low stock items, and trending products',
      parameters: [],
      category: 'statistics',
      requiresAuth: true,
    });

    // Sales Tools
    this.registerTool({
      name: 'get_sales_report',
      description:
        'Get sales report for a seller including daily, weekly, or monthly sales data',
      parameters: [
        {
          name: 'period',
          type: 'string',
          description: 'Time period for the report: daily, weekly, or monthly',
          required: false,
          default: 'daily',
          enum: ['daily', 'weekly', 'monthly'],
        },
      ],
      category: 'sales',
      requiresAuth: true,
    });

    this.registerTool({
      name: 'get_revenue_summary',
      description:
        'Get revenue summary including total revenue, pending payments, and completed transactions',
      parameters: [],
      category: 'sales',
      requiresAuth: true,
    });
  }

  /**
   * Register a new tool
   */
  registerTool(schema: ToolSchema): void {
    this.tools.set(schema.name, schema);
  }

  /**
   * Register an executor function for a tool
   */
  registerExecutor(
    toolName: string,
    executor: (params: any, userId?: string) => Promise<ToolExecutionResult>,
  ): void {
    this.toolExecutors.set(toolName, executor);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolSchema[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolSchema['category']): ToolSchema[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.category === category,
    );
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): ToolSchema | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool by name
   */
  async executeTool(
    name: string,
    params: Record<string, unknown>,
    userId?: string,
  ): Promise<ToolExecutionResult> {
    const executor = this.toolExecutors.get(name);
    if (!executor) {
      return {
        success: false,
        error: `Tool executor not found for: ${name}`,
        toolName: name,
      };
    }

    try {
      return await executor(params, userId);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        toolName: name,
      };
    }
  }

  /**
   * Get tool schema for OpenAI function calling format
   */
  getToolSchemasForOpenAI(): GLMTool[] {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.reduce(
            (acc, param) => {
              const prop: Record<string, unknown> = {
                type: param.type,
                description: param.description,
              };
              if (param.default !== undefined) {
                prop.default = param.default;
              }
              if (param.enum) {
                prop.enum = param.enum;
              }
              acc[param.name] = prop;
              return acc;
            },
            {} as Record<string, Record<string, unknown>>,
          ),
          required: tool.parameters
            .filter((p) => p.required)
            .map((p) => p.name),
        },
      },
    }));
  }
}
