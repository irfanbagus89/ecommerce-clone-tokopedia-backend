/**
 * AI Agent Response Interface
 */
export interface AgentResponse {
  success: boolean;
  message: string;
  data?: unknown;
  toolsUsed?: string[];
  reasoning?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * AI Agent Configuration Interface
 */
export interface AgentConfig {
  maxIterations: number;
  temperature: number;
  model: string;
}

/**
 * Tool Call Interface
 */
export interface ToolCall {
  toolName: string;
  params: Record<string, unknown>;
}

/**
 * Tool Execution Result Interface
 */
export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  toolName: string;
}

/**
 * Tool Parameter Schema Interface
 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: unknown[];
}

/**
 * Tool Schema Interface
 */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: ToolParameter[];
  category: 'products' | 'orders' | 'statistics' | 'sales';
  requiresAuth: boolean;
}
