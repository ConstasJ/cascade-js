import { describe, it, expect, vi } from 'vitest';
import { createPipeline } from '../../src/pipeline/pipeline.js';
import { definePass } from '../../src/pipeline/pass.js';
import type { Pass, PipelineContext } from '../../src/pipeline/pipeline.js';

describe('Pipeline', () => {
  it('empty pipeline returns code unchanged', async () => {
    const pipeline = createPipeline({
      options: { timeout: 5000 },
      passes: [],
    });

    const input = 'const x = 1;';
    const result = await pipeline.run(input);

    expect(result.code).toBe(input);
    expect(result.warnings).toEqual([]);
  });

  it('single pass transforms code', async () => {
    const transformPass = definePass({
      name: 'uppercase',
      transform: async (code: string, _context: PipelineContext) => {
        return code.toUpperCase();
      },
    });

    const pipeline = createPipeline({
      options: { timeout: 5000 },
      passes: [transformPass],
    });

    const input = 'const x = 1;';
    const result = await pipeline.run(input);

    expect(result.code).toBe('CONST X = 1;');
    expect(result.warnings).toEqual([]);
  });

  it('passes execute in dependency order', async () => {
    const executionOrder: string[] = [];

    const passA = definePass({
      name: 'A',
      dependencies: [],
      transform: async (code: string, _context: PipelineContext) => {
        executionOrder.push('A');
        return code + '-A';
      },
    });

    const passB = definePass({
      name: 'B',
      dependencies: ['A'],
      transform: async (code: string, _context: PipelineContext) => {
        executionOrder.push('B');
        return code + '-B';
      },
    });

    const passC = definePass({
      name: 'C',
      dependencies: ['B'],
      transform: async (code: string, _context: PipelineContext) => {
        executionOrder.push('C');
        return code + '-C';
      },
    });

    // Pass them in wrong order intentionally
    const pipeline = createPipeline({
      options: { timeout: 5000 },
      passes: [passC, passA, passB],
    });

    const result = await pipeline.run('START');

    // Should execute in dependency order: A -> B -> C
    expect(executionOrder).toEqual(['A', 'B', 'C']);
    expect(result.code).toBe('START-A-B-C');
    expect(result.warnings).toEqual([]);
  });

  it('pass failure is caught and reported in warnings', async () => {
    const failingPass = definePass({
      name: 'failing',
      transform: async (_code: string, _context: PipelineContext) => {
        throw new Error('Transform failed');
      },
    });

    const pipeline = createPipeline({
      options: { timeout: 5000 },
      passes: [failingPass],
    });

    const input = 'const x = 1;';
    const result = await pipeline.run(input);

    // Code should be unchanged
    expect(result.code).toBe(input);
    // Warning should be recorded
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('failing');
    expect(result.warnings[0]).toContain('Transform failed');
  });

  it('global timeout aborts execution', async () => {
    const slowPass = definePass({
      name: 'slow',
      transform: async (code: string, _context: PipelineContext) => {
        // Simulate slow operation
        await new Promise(resolve => setTimeout(resolve, 200));
        return code + '-SLOW';
      },
    });

    const pipeline = createPipeline({
      options: { timeout: 50 }, // 50ms timeout
      passes: [slowPass],
    });

    const input = 'const x = 1;';
    const result = await pipeline.run(input);

    // Should timeout and return original code
    expect(result.code).toBe(input);
    // Should have timeout warning
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('timeout');
  });

  it('context is shared across passes', async () => {
    const passA = definePass({
      name: 'setter',
      transform: async (code: string, context: PipelineContext) => {
        context.shared = { value: 42 };
        return code;
      },
    });

    const passB = definePass({
      name: 'reader',
      dependencies: ['setter'],
      transform: async (code: string, context: PipelineContext) => {
        const value = (context.shared as any)?.value ?? 0;
        return code + `-VALUE:${value}`;
      },
    });

    const pipeline = createPipeline({
      options: { timeout: 5000 },
      passes: [passA, passB],
    });

    const result = await pipeline.run('START');

    expect(result.code).toBe('START-VALUE:42');
    expect(result.warnings).toEqual([]);
  });
});
