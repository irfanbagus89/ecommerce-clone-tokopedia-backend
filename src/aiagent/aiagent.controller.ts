import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AiagentService } from './aiagent.service';
import { PromptDto, ExecuteToolDto, UpdateConfigDto } from './dto/prompt.dto';
import { ToolRegistryService } from './services/tool-registry.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { JwtPayload } from 'src/auth/jwt.strategy';

interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

/**
 * AI Agent Controller
 * Provides endpoints for interacting with AI Agent
 */
@Controller('aiagent')
@UseGuards(JwtAuthGuard)
export class AiagentController {
  constructor(
    private readonly aiagentService: AiagentService,
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  /**
   * Process a prompt and get AI response
   */
  @Post('prompt')
  @HttpCode(200)
  async processPrompt(
    @Body() promptDto: PromptDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiagentService.processPrompt(
      promptDto.prompt,
      req.user.userId,
      promptDto.context,
    );
  }

  /**
   * Execute a specific tool directly
   */
  @Post('tool/execute')
  @HttpCode(HttpStatus.OK)
  async executeTool(
    @Body() executeToolDto: ExecuteToolDto,
    @Req() req: Request & { user?: { userId: string } },
  ) {
    const userId = req.user?.userId;
    return this.toolRegistry.executeTool(
      executeToolDto.toolName,
      executeToolDto.parameters,
      userId,
    );
  }

  /**
   * Get all available tools
   */
  @Get('tools')
  @HttpCode(HttpStatus.OK)
  getAvailableTools() {
    return {
      tools: this.toolRegistry.getAllTools(),
    };
  }

  /**
   * Get tools by category
   */
  @Get('tools/category')
  @HttpCode(HttpStatus.OK)
  getToolsByCategory(
    @Query('category') category: 'products' | 'orders' | 'statistics' | 'sales',
  ) {
    return {
      category,
      tools: this.toolRegistry.getToolsByCategory(category),
    };
  }

  /**
   * Get tool schemas for GLM function calling
   */
  @Get('tools/schemas')
  @HttpCode(HttpStatus.OK)
  getToolSchemas() {
    return {
      schemas: this.toolRegistry.getToolSchemasForOpenAI(),
    };
  }

  /**
   * Get current agent configuration
   */
  @Get('config')
  @HttpCode(HttpStatus.OK)
  getConfig() {
    return this.aiagentService.getConfig();
  }

  /**
   * Update agent configuration
   */
  @Post('config')
  @HttpCode(HttpStatus.OK)
  updateConfig(@Body() updateConfigDto: UpdateConfigDto) {
    this.aiagentService.updateConfig(updateConfigDto);
    return {
      message: 'Configuration updated successfully',
      config: this.aiagentService.getConfig(),
    };
  }

  /**
   * Get GLM API configuration status
   */
  @Get('glm/status')
  @HttpCode(HttpStatus.OK)
  getGlmStatus() {
    return this.aiagentService.getGlmConfigStatus();
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
