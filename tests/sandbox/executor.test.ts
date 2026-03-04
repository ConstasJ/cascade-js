import { describe, it, expect } from 'vitest';
import { executeInSandbox, extractStringsFromPrelude } from '../../src/sandbox/executor.js';

describe('QuickJS Sandbox Executor', () => {
  it('executes simple code and returns result', async () => {
    const result = await executeInSandbox('1 + 2');
    
    expect(result.success).toBe(true);
    expect(result.result).toBe(3);
  });

  it('catches runtime errors', async () => {
    const result = await executeInSandbox('throw new Error("test error")');
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('test error');
  });

  it('enforces timeout', async () => {
    const code = `
      while (true) {
        // Infinite loop
      }
    `;
    
    const result = await executeInSandbox(code, { timeout: 100 });
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  }, 10000);

  it('extracts strings from string array', async () => {
    const prelude = `
      var _0x1234 = ['Hello', 'World', '!'];
    `;
    
    const result = await extractStringsFromPrelude(prelude, '_0x1234');
    
    expect(result.errors).toHaveLength(0);
    expect(result.strings.get(0)).toBe('Hello');
    expect(result.strings.get(1)).toBe('World');
    expect(result.strings.get(2)).toBe('!');
  });
});
