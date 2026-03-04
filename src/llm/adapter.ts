import type { TaggedStatement, PreludeDetectionResult, LLMOptions } from '../types.js';

export interface LLMAdapter {
  readonly name: string;
  detectPrelude(
    statements: TaggedStatement[],
    options?: LLMOptions
  ): Promise<PreludeDetectionResult>;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export abstract class BaseLLMAdapter implements LLMAdapter {
  abstract readonly name: string;
  
  abstract detectPrelude(
    statements: TaggedStatement[],
    options?: LLMOptions
  ): Promise<PreludeDetectionResult>;

  protected buildPrompt(statements: TaggedStatement[]): string {
    const statementsText = statements
      .map(s => `[${s.id}] ${s.code}`)
      .join('\n');

    return `Analyze the following JavaScript statements and identify the Obfuscator.io prelude patterns.

Statements:
${statementsText}

Please identify:
1. The string array variable ID (the statement that defines the array of encoded strings)
2. The string fetcher function ID (the function that retrieves strings from the array)
3. The rotate function ID (the IIFE that rotates/shuffles the string array)

Respond in JSON format:
{
  "stringArrayId": number | null,
  "stringFetcherId": number | null,
  "rotateId": number | null
}`;
  }
}
