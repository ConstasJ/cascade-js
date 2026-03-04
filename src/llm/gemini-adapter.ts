import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { BaseLLMAdapter } from './adapter.js';
import type { TaggedStatement, PreludeDetectionResult, LLMOptions } from '../types.js';

const ResponseSchema = z.object({
  stringArrayId: z.number().nullable(),
  stringFetcherId: z.number().nullable(),
  rotateId: z.number().nullable(),
});

export class GeminiLLMAdapter extends BaseLLMAdapter {
  readonly name = 'gemini';
  private client: GoogleGenerativeAI;
  private model: string;
  private baseUrl: string | undefined;
  
  constructor(apiKey: string, model = 'gemini-1.5-flash', baseURL?: string) {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.baseUrl = baseURL;
  }
  
  async detectPrelude(
    statements: TaggedStatement[],
    options?: LLMOptions
  ): Promise<PreludeDetectionResult> {
    const prompt = this.buildPrompt(statements);
    const modelToUse = options?.model || this.model;
    
    const requestOptions = this.baseUrl ? { baseUrl: this.baseUrl } : {};
    const generativeModel = this.client.getGenerativeModel({ model: modelToUse }, requestOptions);
    
    const result = await generativeModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'You are a JavaScript deobfuscation expert. Analyze the provided statements and identify Obfuscator.io prelude patterns. Respond ONLY with valid JSON, no markdown formatting.',
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500,
      },
    });
    
    const response = result.response;
    const content = response.text();
    
    if (!content) {
      throw new Error('Empty response from Gemini');
    }
    
    // Extract JSON from response (Gemini may wrap in markdown)
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || 
                      content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
    
    const parsed = JSON.parse(jsonStr);
    const validated = ResponseSchema.parse(parsed);
    
    return {
      stringArrayId: validated.stringArrayId,
      stringFetcherId: validated.stringFetcherId,
      rotateId: validated.rotateId,
      raw: result,
    };
  }
}
