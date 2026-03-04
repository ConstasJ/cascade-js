import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { BaseLLMAdapter } from './adapter.js';
import type { TaggedStatement, PreludeDetectionResult, LLMOptions } from '../types.js';

const ResponseSchema = z.object({
  stringArrayId: z.number().nullable(),
  stringFetcherId: z.number().nullable(),
  rotateId: z.number().nullable(),
});

export class AnthropicLLMAdapter extends BaseLLMAdapter {
  readonly name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-3-haiku-20240307', baseURL?: string) {
    super();
    this.client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
    this.model = model;
  }

  async detectPrelude(
    statements: TaggedStatement[],
    options?: LLMOptions
  ): Promise<PreludeDetectionResult> {
    const prompt = this.buildPrompt(statements);

    const response = await this.client.messages.create({
      model: options?.model ?? this.model,
      max_tokens: 500,
      temperature: 0.1,
      system:
        'You are a JavaScript deobfuscation expert. Analyze the provided statements and identify Obfuscator.io prelude patterns. Return only valid JSON.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : null;

    if (!content) {
      throw new Error('Empty response from Anthropic');
    }

    const parsed = JSON.parse(content);
    const validated = ResponseSchema.parse(parsed);

    return {
      stringArrayId: validated.stringArrayId,
      stringFetcherId: validated.stringFetcherId,
      rotateId: validated.rotateId,
      raw: response,
    };
  }
}
