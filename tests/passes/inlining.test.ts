import { describe, it, expect } from 'vitest';
import { parse } from '@babel/parser';
import generate from '@babel/generator';
import { inliningPass } from '../../src/passes/inlining.js';
import type { PipelineContext } from '../../src/types.js';
import type { DeobfuscationStats } from '../../src/types.js';

function createMockContext(): PipelineContext {
  return {
    options: {},
    prelude: null,
    recoveredStrings: new Map(),
    stats: {
      recoveredLiterals: 0,
      passesApplied: [],
      timingMs: {},
      preludeDetected: false,
    } as DeobfuscationStats,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
}

function parseCode(code: string) {
  return parse(code, { sourceType: 'script' });
}

describe('Inlining Pass', () => {
  it('inlines simple single-call functions', () => {
    const code = `
      function add(a, b) {
        return a + b;
      }
      var result = add(1, 2);
    `;
    const ast = parseCode(code);
    const context = createMockContext();
    
    const result = inliningPass.transform(ast, context);
    const output = generate(result).code;
    
    // Function should be inlined
    expect(context.stats.passesApplied).toContain('inlining');
    expect(output).toContain('1 + 2');
    expect(output).not.toContain('function add');
  });

  it('does not inline multi-call functions', () => {
    const code = `
      function greet(name) {
        return 'Hello ' + name;
      }
      greet('Alice');
      greet('Bob');
    `;
    const ast = parseCode(code);
    const context = createMockContext();
    
    inliningPass.transform(ast, context);
    
    // Should not inline because called twice
    expect(context.stats.passesApplied).not.toContain('inlining');
  });

  it('does not inline large functions', () => {
    const code = `
      function big() {
        var x = 1;
        var y = 2;
        var z = 3;
        var w = 4;
        return x + y + z + w;
      }
      big();
    `;
    const ast = parseCode(code);
    const context = createMockContext();
    
    inliningPass.transform(ast, context);
    
    // Should not inline because body has 5 statements (4 var + 1 return)
    expect(context.stats.passesApplied).not.toContain('inlining');
  });

  it('tracks dependencies on constant-propagation', () => {
    expect(inliningPass.dependencies).toContain('constant-propagation');
  });

  it('handles arrow functions', () => {
    const code = `
      const double = (x) => x * 2;
      var result = double(5);
    `;
    const ast = parseCode(code);
    const context = createMockContext();
    
    const result = inliningPass.transform(ast, context);
    const output = generate(result).code;
    
    // Should inline arrow function
    expect(context.stats.passesApplied).toContain('inlining');
    expect(output).toContain('5 * 2');
    expect(output).not.toContain('const double');
  });

  it('inlines functions with zero parameters', () => {
    const code = `
      function getConstant() {
        return 42;
      }
      var x = getConstant();
    `;
    const ast = parseCode(code);
    const context = createMockContext();
    
    const result = inliningPass.transform(ast, context);
    const output = generate(result).code;
    
    // Should inline
    expect(context.stats.passesApplied).toContain('inlining');
    expect(output).toContain('42');
    expect(output).not.toContain('function getConstant');
  });

  it('does not inline impure functions with side effects', () => {
    const code = `
      function logAndReturn(x) {
        console.log(x);
        return x;
      }
      var result = logAndReturn(5);
    `;
    const ast = parseCode(code);
    const context = createMockContext();
    
    inliningPass.transform(ast, context);
    
    // Should not inline because console.log is impure
    expect(context.stats.passesApplied).not.toContain('inlining');
  });

  it('inlines with identifier arguments', () => {
    const code = `
      var a = 10;
      var b = 20;
      function multiply(x, y) {
        return x * y;
      }
      var result = multiply(a, b);
    `;
    const ast = parseCode(code);
    const context = createMockContext();
    
    const result = inliningPass.transform(ast, context);
    const output = generate(result).code;
    
    // Should inline with identifiers
    expect(context.stats.passesApplied).toContain('inlining');
    expect(output).toContain('a * b');
  });
});
