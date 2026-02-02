import { IsString, IsOptional, IsObject } from 'class-validator';

export class PromptDto {
  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class ToolCallDto {
  @IsString()
  toolName: string;

  @IsObject()
  parameters: Record<string, unknown>;
}

export class ExecuteToolDto {
  @IsString()
  toolName: string;

  @IsObject()
  parameters: Record<string, unknown>;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class UpdateConfigDto {
  @IsOptional()
  maxIterations?: number;

  @IsOptional()
  temperature?: number;

  @IsOptional()
  @IsString()
  model?: string;
}
