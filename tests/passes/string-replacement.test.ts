import { describe, it, expect } from 'vitest';
import { stringReplacementPass } from '../../src/passes/string-replacement.js';
import type { PipelineContext } from '../../src/pipeline/pipeline.js';

function createMockContext(recoveredStrings: Map<number, string> = new Map()): PipelineContext {
  return {
    shared: {
      recoveredStrings,
    },
  };
}

describe('String Replacement Pass', () => {
  it('replaces string fetcher function calls with literal strings', async () => {
    const code = `
      var msg = _0x1234(0);
      console.log(msg);
    `;
    
    const strings = new Map([
      [0, 'hello world'],
    ]);
    
    const context = createMockContext(strings);
    const result = await stringReplacementPass.transform(code, context);
    
    expect(result).toContain('"hello world"');
    expect(result).not.toContain('_0x1234(0)');
    expect(context.shared.stringReplacements).toBe(1);
  });

  it('replaces array member access with literal strings', async () => {
    const code = `
      var text = _0x5678[5];
      var msg = _0x5678[10];
    `;
    
    const strings = new Map([
      [5, 'first string'],
      [10, 'second string'],
    ]);
    
    const context = createMockContext(strings);
    const result = await stringReplacementPass.transform(code, context);
    
    expect(result).toContain('"first string"');
    expect(result).toContain('"second string"');
    expect(context.shared.stringReplacements).toBe(2);
  });

  it('handles computed index expressions (binary operations)', async () => {
    const code = `
      var msg = _0xabcd(100 - 100);
    `;
    
    const strings = new Map([
      [0, 'computed string'],
    ]);
    
    const context = createMockContext(strings);
    const result = await stringReplacementPass.transform(code, context);
    
    expect(result).toContain('"computed string"');
  });

  it('replaces multiple string references in complex code', async () => {
    const code = `
      function greet() {
        var title = _0xfeed(0);
        var name = _0xfeed(1);
        var ending = _0xfeed(2);
        console.log(title + name + ending);
      }
    `;
    
    const strings = new Map([
      [0, 'Hello '],
      [1, 'World'],
      [2, '!'],
    ]);
    
    const context = createMockContext(strings);
    const result = await stringReplacementPass.transform(code, context);
    
    expect(result).toContain('"Hello "');
    expect(result).toContain('"World"');
    expect(result).toContain('"!"');
    expect(context.shared.stringReplacements).toBe(3);
  });

  it('does nothing when no recovered strings are available', async () => {
    const code = `
      var msg = _0x1234(0);
      console.log(msg);
    `;
    
    const context = createMockContext(); // Empty map
    const result = await stringReplacementPass.transform(code, context);
    
    // Code should be unchanged
    expect(result).toContain('_0x1234(0)');
    expect(context.shared.stringReplacements).toBeUndefined();
  });

  it('only replaces strings that exist in recovered strings map', async () => {
    const code = `
      var known = _0xbeef(5);
      var unknown = _0xbeef(999);
    `;
    
    const strings = new Map([
      [5, 'known string'],
      // 999 is not in the map
    ]);
    
    const context = createMockContext(strings);
    const result = await stringReplacementPass.transform(code, context);
    
    expect(result).toContain('"known string"');
    expect(result).toContain('_0xbeef(999)'); // Should remain unchanged
    expect(context.shared.stringReplacements).toBe(1);
  });

  it('handles strings with special characters correctly', async () => {
    const code = `
      var newline = _0xcafe(0);
      var quote = _0xcafe(1);
      var unicode = _0xcafe(2);
    `;
    
    const strings = new Map([
      [0, 'line1\nline2'],
      [1, "it's a quote"],
      [2, '你好世界'],
    ]);
    
    const context = createMockContext(strings);
    const result = await stringReplacementPass.transform(code, context);
    
    // Babel should properly escape these in string literals
    expect(result).toContain('line1');
    expect(result).toContain('line2');
    // Babel escapes unicode to \uXXXX format
    expect(result).toContain('line1');
    expect(result).toContain('line2');
    expect(result).toContain("it's a quote");
    // Check for escaped unicode
    expect(result).toContain('\\u4F60'); // First char of 你好世界

  });
  it('handles hexadecimal numeric literals as indices', async () => {
    const code = `
      var msg1 = _0xdead(0x0);
      var msg2 = _0xdead(0xa);
      var msg3 = _0xdead(0x10);
    `;
    
    const strings = new Map([
      [0, 'zero'],
      [10, 'ten'],
      [16, 'sixteen'],
    ]);
    
    const context = createMockContext(strings);
    const result = await stringReplacementPass.transform(code, context);
    
    expect(result).toContain('"zero"');
    expect(result).toContain('"ten"');
    expect(result).toContain('"sixteen"');
    expect(context.shared.stringReplacements).toBe(3);
  });
});