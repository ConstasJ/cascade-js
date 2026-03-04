import { BaseLLMAdapter, type LLMResponse } from './adapter.js';
import type { TaggedStatement, PreludeDetectionResult, LLMOptions } from '../types.js';
import { z } from 'zod';

const PreludeDetectionResponseSchema = z.object({
  stringArrayId: z.number().nullable(),
  stringFetcherId: z.number().nullable(),
  rotateId: z.number().nullable(),
});

export class MockLLMAdapter extends BaseLLMAdapter {
  readonly name = 'mock';

  async detectPrelude(
    statements: TaggedStatement[],
    _options?: LLMOptions
  ): Promise<PreludeDetectionResult> {
    // Simple heuristic detection for testing
    let stringArrayId: number | null = null;
    let stringFetcherId: number | null = null;
    let rotateId: number | null = null;

    for (const stmt of statements) {
      const code = stmt.code.toLowerCase();

      // Detect string array: var _0x... = [...]
      if (/var\s+_0x[a-f0-9]+\s*=\s*\[/.test(stmt.code)) {
        stringArrayId = stmt.id;
      }

      // Detect string fetcher: function _0x...(x, y) { ... }
      if (/function\s+_0x[a-f0-9]+\s*\([^)]*\)/.test(stmt.code) && 
          stmt.code.includes('return')) {
        stringFetcherId = stmt.id;
      }

      // Detect rotate IIFE
      if (code.includes('while') && code.includes('!![]') && 
          code.includes('parseint')) {
        rotateId = stmt.id;
      }
    }

    return {
      stringArrayId,
      stringFetcherId,
      rotateId,
      raw: { detectedBy: 'mock-heuristic' },
    };
  }
}
