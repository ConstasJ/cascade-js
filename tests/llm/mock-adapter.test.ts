import { describe, it, expect } from 'vitest';
import { MockLLMAdapter } from '../../src/llm/mock-adapter.js';
import type { TaggedStatement } from '../../src/types.js';

describe('MockLLMAdapter', () => {
  const adapter = new MockLLMAdapter();

  it('detects string array in prelude', async () => {
    const statements: TaggedStatement[] = [
      { id: 0, code: "var _0x4c0c = ['log', 'Hello World!'];", start: 0, end: 40 },
      { id: 1, code: "console.log('test');", start: 41, end: 62 },
    ];

    const result = await adapter.detectPrelude(statements);

    expect(result.stringArrayId).toBe(0);
    expect(result.stringFetcherId).toBeNull();
    expect(result.rotateId).toBeNull();
  });

  it('detects string fetcher function', async () => {
    const statements: TaggedStatement[] = [
      { id: 0, code: "var _0x4c0c = ['log', 'Hello'];", start: 0, end: 35 },
      { id: 1, code: "function _0x1e4(_0x5d6, _0x7f8) { return _0x4c0c[_0x5d6 - 0x1e4]; }", start: 36, end: 95 },
    ];

    const result = await adapter.detectPrelude(statements);

    expect(result.stringArrayId).toBe(0);
    expect(result.stringFetcherId).toBe(1);
  });

  it('returns null when no prelude detected', async () => {
    const statements: TaggedStatement[] = [
      { id: 0, code: "var x = 1;", start: 0, end: 10 },
      { id: 1, code: "console.log(x);", start: 11, end: 26 },
    ];

    const result = await adapter.detectPrelude(statements);

    expect(result.stringArrayId).toBeNull();
    expect(result.stringFetcherId).toBeNull();
    expect(result.rotateId).toBeNull();
  });
});
