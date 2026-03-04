import OpenAI from 'openai';
import { z } from 'zod';
import { BaseLLMAdapter } from './adapter.js';
import type { TaggedStatement, PreludeDetectionResult, LLMOptions } from '../types.js';

const ResponseSchema = z.object({
  stringArrayId: z.number().nullable(),
  stringFetcherId: z.number().nullable(),
  rotateId: z.number().nullable(),
});

export class OpenAILLMAdapter extends BaseLLMAdapter {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini', baseURL?: string) {
    super();
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    this.model = model;
  }

  async detectPrelude(
    statements: TaggedStatement[],
    options?: LLMOptions
  ): Promise<PreludeDetectionResult> {
    const prompt = this.buildPrompt(statements);

    const response = await this.client.chat.completions.create({
      model: options?.model ?? this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a JavaScript deobfuscation expert. Analyze the provided statements and identify Obfuscator.io prelude patterns. Return only valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
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
