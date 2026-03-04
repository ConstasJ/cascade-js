import { z } from 'zod';
import * as babel from '@babel/types';

// ============================================================================
// Core Types
// ============================================================================

export interface CascadeOptions {
  llmAdapter?: LLMAdapter;
  timeout?: number;
  debug?: boolean;
  sandbox?: SandboxOptions;
}

export interface CascadeResult {
  code: string;
  success: boolean;
  warnings: string[];
  errors: string[];
  stats: DeobfuscationStats;
}

export interface DeobfuscationStats {
  recoveredLiterals: number;
  passesApplied: string[];
  timingMs: Record<string, number>;
  preludeDetected: boolean;
}

export interface TaggedStatement {
  id: number;
  code: string;
  start: number;
  end: number;
}

export interface PreludeDetectionResult {
  stringArrayId: number | null;
  stringFetcherId: number | null;
  rotateId: number | null;
  raw: unknown;
}

export enum PreludeTemplate {
  StringArrayTemplate = 'StringArrayTemplate',
  StringArrayCallsWrapperTemplate = 'StringArrayCallsWrapperTemplate',
  StringArrayRotateFunctionTemplate = 'StringArrayRotateFunctionTemplate',
}

export interface AbstractValue {
  kind: 'uninit' | 'const' | 'unknown' | 'prelude-ref' | 'inline-expr';
  value?: unknown;
  expr?: babel.Expression;
}

export interface SandboxResult {
  strings: Map<number, string>;
  errors: string[];
}

export interface SandboxOptions {
  memoryLimit?: number;
  timeout?: number;
}

// ============================================================================
// Interfaces for Pipeline Components
// ============================================================================

export interface LLMAdapter {
  name: string;
  detectPrelude(statements: TaggedStatement[], options?: LLMOptions): Promise<PreludeDetectionResult>;
}

export interface LLMOptions {
  timeout?: number;
  model?: string;
}

// AST-based pass interface (for passes that work directly with Babel AST)
// Note: Most passes now use string-based transformation from pipeline/pass.ts
export interface ASTPass {
  name: string;
  dependencies?: string[];
  transform(ast: babel.File, context: PipelineContext): babel.File | Promise<babel.File>;
}


export interface PipelineContext {
  options: CascadeOptions;
  prelude: PreludeDetectionResult | null;
  recoveredStrings: Map<number, string>;
  stats: DeobfuscationStats;
  logger: Logger;
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

export const PreludeDetectionResultSchema = z.object({
  stringArrayId: z.number().nullable(),
  stringFetcherId: z.number().nullable(),
  rotateId: z.number().nullable(),
  raw: z.unknown(),
});

export type PreludeDetectionResultType = z.infer<typeof PreludeDetectionResultSchema>;

export const DeobfuscationStatsSchema = z.object({
  recoveredLiterals: z.number(),
  passesApplied: z.array(z.string()),
  timingMs: z.record(z.string(), z.number()),
  preludeDetected: z.boolean(),
});

export type DeobfuscationStatsType = z.infer<typeof DeobfuscationStatsSchema>;

export const CascadeResultSchema = z.object({
  code: z.string(),
  success: z.boolean(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  stats: DeobfuscationStatsSchema,
});

export type CascadeResultType = z.infer<typeof CascadeResultSchema>;

export const CascadeOptionsSchema = z.object({
  timeout: z.number().optional(),
  debug: z.boolean().optional(),
});

export type CascadeOptionsType = z.infer<typeof CascadeOptionsSchema>;

export const SandboxOptionsSchema = z.object({
  memoryLimit: z.number().optional(),
  timeout: z.number().optional(),
});

export type SandboxOptionsType = z.infer<typeof SandboxOptionsSchema>;

export const LLMOptionsSchema = z.object({
  timeout: z.number().optional(),
  model: z.string().optional(),
});

export type LLMOptionsType = z.infer<typeof LLMOptionsSchema>;

export const TaggedStatementSchema = z.object({
  id: z.number(),
  code: z.string(),
  start: z.number(),
  end: z.number(),
});

export type TaggedStatementType = z.infer<typeof TaggedStatementSchema>;
