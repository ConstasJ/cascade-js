import { Ollama } from 'ollama';
import { z } from 'zod';
import { BaseLLMAdapter } from './adapter.js';
import type { TaggedStatement, PreludeDetectionResult, LLMOptions } from '../types.js';

const ResponseSchema = z.object({
  stringArrayId: z.number().nullable(),
  stringFetcherId: z.number().nullable(),
  rotateId: z.number().nullable(),
});

export class OllamaLLMAdapter extends BaseLLMAdapter {
  readonly name = 'ollama';
  private client: Ollama;
  private model: string;
  
  constructor(model = 'llama3.2', host = 'http://localhost:11434') {
    super();
    this.client = new Ollama({ host });
    this.model = model;
  }
  
  async detectPrelude(
    statements: TaggedStatement[],
    options?: LLMOptions
  ): Promise<PreludeDetectionResult> {
    const prompt = this.buildPrompt(statements);
    const modelToUse = options?.model || this.model;
    
    const response = await this.client.generate({
      model: modelToUse,
      prompt,
      system: 'You are a JavaScript deobfuscation expert. Analyze the provided statements and identify Obfuscator.io prelude patterns. Return only valid JSON.',
      format: 'json',
      options: {
        temperature: 0.1,
      },
    });
    
    const content = response.response;
    if (!content) {
      throw new Error('Empty response from Ollama');
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
