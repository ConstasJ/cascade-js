import { describe, it, expect } from 'vitest';
import { stringArrayPass } from '../../../src/passes/extensions/string-array.js';
import type { PipelineContext } from '../../../src/pipeline/pipeline.js';

function createContext(): PipelineContext {
  return {
    shared: {},
  } as PipelineContext;
}

describe('string-array pass (AST detection)', () => {
  it('should detect and replace simple string array variable pattern', async () => {
    const code = `
var _0xabcd = ["hello", "world", "foo", "bar", "baz", "qux"];
console.log(_0xabcd[0]);
console.log(_0xabcd[1]);
`;
    const result = await stringArrayPass.transform(code, createContext());
    expect(result).toContain('"hello"');
    expect(result).toContain('"world"');
    expect(result).not.toContain('_0xabcd[0]');
    expect(result).not.toContain('_0xabcd[1]');
  });

  it('should detect self-replacing function pattern', async () => {
    const code = `
function _0xabcd() {
  var _0xarr = ["hello", "world", "foo", "bar", "baz", "qux"];
  _0xabcd = function() { return _0xarr; };
  return _0xabcd();
}
console.log(_0xabcd()[0]);
`;
    // The function declaration should be detected as a string array
    const result = await stringArrayPass.transform(code, createContext());
    // Since there's no decoder function, direct array access calls won't match
    // but the detection should work
    const ctx = createContext();
    await stringArrayPass.transform(code, ctx);
    expect(ctx.shared.stringArrayDetected).toBe(true);
  });

  it('should detect decoder function and replace calls', async () => {
    const code = `
function _0xabcd() {
  var _0xarr = ["hello", "world", "foo", "bar", "baz", "qux"];
  _0xabcd = function() { return _0xarr; };
  return _0xabcd();
}
function _0x1234(index) {
  index = index - 0;
  var _0xresult = _0xabcd();
  return _0xresult[index];
}
console.log(_0x1234(0));
console.log(_0x1234(1));
`;
    const result = await stringArrayPass.transform(code, createContext());
    expect(result).toContain('"hello"');
    expect(result).toContain('"world"');
    expect(result).not.toContain('_0x1234');
  });

  it('should handle index shift in decoder', async () => {
    const code = `
function _0xabcd() {
  var _0xarr = ["hello", "world", "foo", "bar", "baz", "qux"];
  _0xabcd = function() { return _0xarr; };
  return _0xabcd();
}
function _0x1234(index) {
  index = index - 100;
  var _0xresult = _0xabcd();
  return _0xresult[index];
}
console.log(_0x1234(100));
console.log(_0x1234(101));
`;
    const result = await stringArrayPass.transform(code, createContext());
    expect(result).toContain('"hello"');
    expect(result).toContain('"world"');
  });

  it('should not modify code without string arrays', async () => {
    const code = `var x = 1;\nconsole.log(x);`;
    const result = await stringArrayPass.transform(code, createContext());
    expect(result).toBe(code);
  });

  it('should remove string array infrastructure after replacement', async () => {
    const code = `
var _0xarr = ["hello", "world", "foo", "bar", "baz", "qux"];
console.log(_0xarr[0]);
`;
    const result = await stringArrayPass.transform(code, createContext());
    // The array declaration should be removed
    expect(result).not.toContain('_0xarr = [');
    expect(result).toContain('"hello"');
  });
});
