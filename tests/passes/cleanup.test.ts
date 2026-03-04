import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import generate from '@babel/generator';
import { cleanupPass } from '../../src/passes/cleanup.js';
import type { PipelineContext } from '../../src/types.js';

function createMockContext(): PipelineContext {
  return {
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    options: {},
    prelude: null,
    recoveredStrings: new Map(),
    stats: {
      passesApplied: [],
      recoveredLiterals: 0,
      timingMs: {},
      preludeDetected: false,
    },
  };
}

function testTransform(input: string): string {
  const ast = parse(input, { sourceType: 'module' });
  const context = createMockContext();
  const transformed = cleanupPass.transform(ast, context);
  const output = generate(transformed);
  return output.code;
}

describe('Cleanup Pass', () => {
  it('should remove unused variables', () => {
    const input = `
      const used = 42;
      const unused = 100;
      console.log(used);
    `;
    
    const output = testTransform(input);
    
    expect(output).toContain('used');
    expect(output).toContain('42');
    expect(output).not.toContain('unused');
    expect(output).not.toContain('100');
  });

  it('should remove dead if (false) blocks', () => {
    const input = `
      const x = 1;
      if (false) {
        console.log("This should be removed");
      }
      if (true) {
        console.log("This stays");
      }
      console.log(x);
    `;
    
    const output = testTransform(input);
    
    expect(output).not.toContain('This should be removed');
    expect(output).toContain('This stays');
    expect(output).toContain('console.log(x)');
  });

  it('should remove empty functions', () => {
    const input = `
      function empty() {
      }
      
      function notEmpty() {
        return 42;
      }
      
      notEmpty();
    `;
    
    const output = testTransform(input);
    
    expect(output).not.toContain('function empty');
    expect(output).toContain('function notEmpty');
    expect(output).toContain('return 42');
  });

  it('should handle combined cleanup scenario', () => {
    const input = `
      const used = "hello";
      const unused1 = "remove me";
      const unused2 = 123;
      
      function emptyFunc() {
      }
      
      if (false) {
        console.log("dead code");
      }
      
      function actualWork() {
        console.log(used);
      }
      
      actualWork();
    `;
    
    const output = testTransform(input);
    
    // Should keep
    expect(output).toContain('used');
    expect(output).toContain('hello');
    expect(output).toContain('actualWork');
    
    // Should remove
    expect(output).not.toContain('unused1');
    expect(output).not.toContain('unused2');
    expect(output).not.toContain('remove me');
    expect(output).not.toContain('emptyFunc');
    expect(output).not.toContain('dead code');
  });

  it('should preserve variables used in nested scopes', () => {
    const input = `
      const outer = 42;
      function useOuter() {
        return outer + 1;
      }
      useOuter();
    `;
    
    const output = testTransform(input);
    
    expect(output).toContain('outer');
    expect(output).toContain('42');
    expect(output).toContain('useOuter');
  });

  it('should handle partially unused variable declarations', () => {
    const input = `
      const a = 1, b = 2, c = 3;
      console.log(a);
      console.log(c);
    `;
    
    const output = testTransform(input);
    
    expect(output).toContain('a');
    expect(output).toContain('c');
    // b should be removed (partially unused declaration)
    const bCount = (output.match(/\bb\b/g) || []).length;
    expect(bCount).toBe(0);
  });
});
