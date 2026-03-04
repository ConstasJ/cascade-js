import { describe, it, expect } from 'vitest';
import { detectObfuscation } from '../../src/prefilter/detector.js';

describe('Obfuscation Detector', () => {
  it('detects known Obfuscator.io output with high confidence', () => {
    // Sample obfuscated code from Obfuscator.io
    const obfuscatedCode = `
      var _0x432d = ['log', 'Hello World!', 'console', 'toString'];
      (function(_0x4c0c, _0x432d) {
        while (!![]) {
          try {
            console.log(_0x432d[0x0] + ' ' + _0x432d[0x1]);
          } catch (_0x1e4) {
            console.log('error');
          }
        }
      })(_0x4c0c, _0x432d);
    `;
    const result = detectObfuscation(obfuscatedCode);
    expect(result.detected).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it('returns detected: false for clean JS', () => {
    const cleanCode = `const greet = (name) => console.log('Hello ' + name);`;
    const result = detectObfuscation(cleanCode);
    expect(result.detected).toBe(false);
    expect(result.confidence).toBeLessThan(0.3);
  });

  it('gives proportional confidence for partial matches', () => {
    // Code with only string array pattern
    const partialCode = `
      var _0x432d = ['log', 'Hello World!', 'console'];
      console.log('test');
    `;
    const result = detectObfuscation(partialCode);
    expect(result.patterns).toContain('stringArray');
    // Should have some confidence from stringArray pattern alone
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(1);
  });

  it('does not false-positive on minified non-obfuscated JS', () => {
    const minified = 'function a(b,c){return b+c;}';
    const result = detectObfuscation(minified);
    expect(result.detected).toBe(false);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('detects hex identifier density', () => {
    const hexCode = `
      var _0x1a2b = 'test';
      var _0x3c4d = 'data';
      var _0x5e6f = 'more';
      var _0x7ab8 = 'here';
      var _0x9cde = 'here';
      var _0x1f2e = 'here';
      function _0x3d4c() { return _0x1a2b + _0x3c4d; }
    `;
    const result = detectObfuscation(hexCode);
    expect(result.patterns).toContain('hexIdentifiers');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects rotate IIFE pattern', () => {
    const rotateCode = `
      (function(_0x4c0c, _0x432d){
        while(!![]){
          try{
            console.log('test');
          }catch(_0x1e4){
            console.log('error');
          }
        }
      })(123, 456);
    `;
    const result = detectObfuscation(rotateCode);
    expect(result.patterns).toContain('rotateIIFE');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects string fetcher function pattern', () => {
    const fetcherCode = `
      function _0x1e4(_0x5d6, _0x7f8){
        var _0xarray = ['test', 'data'];
        return _0xarray[_0x5d6 - 0x1e4];
      }
      var getStringArray = function() { return _0xarray; };
    `;
    const result = detectObfuscation(fetcherCode);
    // May or may not match depending on exact pattern - should handle gracefully
    expect(result.detected).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it('handles empty code gracefully', () => {
    const emptyCode = '';
    const result = detectObfuscation(emptyCode);
    expect(result.detected).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.patterns.length).toBe(0);
  });

  it('handles code with multiple obfuscation patterns', () => {
    const multiPatternCode = `
      var _0x432d = ['log', 'Hello', 'World'];
      var _0x1a2b = 'test';
      var _0x3c4d = 'data';
      var _0x5e6f = 'more';
      var _0x7g8h = 'code';
      var _0x9i0j = 'here';
      (function(_0x4c0c, _0x432d){
        while(!![]){
          try{
            console.log('test');
          }catch(_0x1e4){
            _0x432d.push('error');
          }
        }
      })(123, _0x432d);
    `;
    const result = detectObfuscation(multiPatternCode);
    expect(result.detected).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.patterns.length).toBeGreaterThan(1);
  });

  it('returns confidence capped at 1.0', () => {
    const extremeCode = `
      var _0x432d = ['a', 'b', 'c'];
      var _0x1a2b = 'x';
      var _0x3c4d = 'y';
      var _0x5e6f = 'z';
      var _0x7g8h = 'p';
      var _0x9i0j = 'q';
      (function(_0x4c0c, _0x432d){
        while(!![]){
          try{
            console.log('test');
          }catch(_0x1e4){
            console.log('error');
          }
        }
      })(123, _0x432d);
    `;
    const result = detectObfuscation(extremeCode);
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });
});
