import { describe, it, expect, vi, beforeEach } from 'vitest';
import { booleanLiteralsPass } from '../../../src/transform/extensions/boolean-literals.js';
import { controlFlowFlatteningPass } from '../../../src/transform/extensions/control-flow-flattening.js';
import { deadCodeRemovalPass } from '../../../src/transform/extensions/dead-code-removal.js';
import { splitStringsPass } from '../../../src/transform/extensions/split-strings.js';
import { unicodeEscapePass } from '../../../src/transform/extensions/unicode-escape.js';
import { numbersToExpressionsPass } from '../../../src/transform/extensions/numbers-to-expressions.js';
import { objectKeysPass } from '../../../src/transform/extensions/object-keys.js';
import { selfDefendingPass } from '../../../src/transform/extensions/self-defending.js';
import { debugProtectionPass } from '../../../src/transform/extensions/debug-protection.js';
import { consoleOutputPass } from '../../../src/transform/extensions/console-output.js';
import { domainLockPass } from '../../../src/transform/extensions/domain-lock.js';
import { unminifyPass } from '../../../src/transform/extensions/unminify.js';
import type { PipelineContext } from '../../../src/pipeline/pipeline.js';

// Mock context
function createContext(): PipelineContext {
  return {
    shared: {},
  } as PipelineContext;
}

describe('Extension Passes', () => {
  // ==========================================================
  // Boolean Literals
  // ==========================================================
  describe('boolean-literals pass', () => {
    it('should transform ![] to false', async () => {
      const result = await booleanLiteralsPass.transform('const x = ![];', createContext());
      expect(result).toContain('false');
      expect(result).not.toContain('![]');
    });

    it('should transform !![] to true', async () => {
      const result = await booleanLiteralsPass.transform('const x = !![];', createContext());
      expect(result).toContain('true');
    });

    it('should transform !0 to true and !1 to false', async () => {
      const result = await booleanLiteralsPass.transform('const a = !0; const b = !1;', createContext());
      expect(result).toContain('true');
      expect(result).toContain('false');
    });

    it('should not transform non-literal NOT operations', async () => {
      const result = await booleanLiteralsPass.transform('const x = !y;', createContext());
      expect(result).toContain('!y');
    });
  });

  // ==========================================================
  // Dead Code Removal
  // ==========================================================
  describe('dead-code-removal pass', () => {
    it('should remove dead code from always-true string comparison', async () => {
      const code = `if ("abc" === "abc") { console.log("real"); } else { console.log("dead"); }`;
      const result = await deadCodeRemovalPass.transform(code, createContext());
      expect(result).toContain('real');
      expect(result).not.toContain('dead');
    });

    it('should remove dead code from always-false string comparison', async () => {
      const code = `if ("abc" === "def") { console.log("dead"); } else { console.log("real"); }`;
      const result = await deadCodeRemovalPass.transform(code, createContext());
      expect(result).toContain('real');
      expect(result).not.toContain('dead');
    });

    it('should handle !== operator', async () => {
      const code = `if ("abc" !== "abc") { console.log("dead"); } else { console.log("real"); }`;
      const result = await deadCodeRemovalPass.transform(code, createContext());
      expect(result).toContain('real');
      expect(result).not.toContain('dead');
    });

    it('should remove entire if when condition is false and no else', async () => {
      const code = `if ("abc" === "def") { console.log("dead"); }\nconsole.log("after");`;
      const result = await deadCodeRemovalPass.transform(code, createContext());
      expect(result).not.toContain('dead');
      expect(result).toContain('after');
    });

    it('should not modify non-literal comparisons', async () => {
      const code = `if (x === y) { console.log("a"); } else { console.log("b"); }`;
      const result = await deadCodeRemovalPass.transform(code, createContext());
      expect(result).toContain('x === y');
    });
  });

  // ==========================================================
  // Control Flow Flattening
  // ==========================================================
  describe('control-flow-flattening pass', () => {
    it('should reverse switch-based control flow', async () => {
      const code = `
var _0xseq = "1|0|2".split("|");
var _0xidx = 0;
while (true) {
  switch (_0xseq[_0xidx++]) {
    case "0":
      console.log("B");
      continue;
    case "1":
      console.log("A");
      continue;
    case "2":
      console.log("C");
      continue;
  }
  break;
}`;
      const result = await controlFlowFlatteningPass.transform(code, createContext());
      // After flattening reversal, statements should be in order: A, B, C
      const aIdx = result.indexOf('"A"');
      const bIdx = result.indexOf('"B"');
      const cIdx = result.indexOf('"C"');
      expect(aIdx).toBeLessThan(bIdx);
      expect(bIdx).toBeLessThan(cIdx);
      // Should not contain switch/case anymore
      expect(result).not.toContain('switch');
    });

    it('should not modify code without CFF patterns', async () => {
      const code = `const x = 1;\nconsole.log(x);`;
      const result = await controlFlowFlatteningPass.transform(code, createContext());
      expect(result).toBe(code);
    });
  });

  // ==========================================================
  // Split Strings
  // ==========================================================
  describe('split-strings pass', () => {
    it('should join split string literals', async () => {
      const code = `var x = "hel" + "lo" + " wor" + "ld";`;
      const result = await splitStringsPass.transform(code, createContext());
      expect(result).toContain('"hello world"');
    });

    it('should not join string + non-string', async () => {
      const code = `var x = "hello" + y;`;
      const result = await splitStringsPass.transform(code, createContext());
      expect(result).toContain('"hello" + y');
    });

    it('should handle single string (no concat)', async () => {
      const code = `var x = "hello";`;
      const result = await splitStringsPass.transform(code, createContext());
      expect(result).toContain('"hello"');
    });
  });

  // ==========================================================
  // Unicode Escape
  // ==========================================================
  describe('unicode-escape pass', () => {
    it('should normalize hex escape sequences', async () => {
      const code = `var x = "\\x68\\x65\\x6c\\x6c\\x6f";`;
      const result = await unicodeEscapePass.transform(code, createContext());
      expect(result).toContain('"hello"');
    });

    it('should normalize unicode escape sequences', async () => {
      const code = `var x = "\\u0068\\u0065\\u006c\\u006c\\u006f";`;
      const result = await unicodeEscapePass.transform(code, createContext());
      expect(result).toContain('"hello"');
    });

    it('should not modify normal strings', async () => {
      const code = `var x = "hello";`;
      const result = await unicodeEscapePass.transform(code, createContext());
      expect(result).toBe(code);
    });
  });

  // ==========================================================
  // Numbers to Expressions
  // ==========================================================
  describe('numbers-to-expressions pass', () => {
    it('should simplify arithmetic expressions to numbers', async () => {
      const code = `var x = 50 + 100 * 2 - 127;`;
      const result = await numbersToExpressionsPass.transform(code, createContext());
      expect(result).toContain('123');
      expect(result).not.toContain('50 +');
    });

    it('should simplify simple binary', async () => {
      const code = `var x = 2 + 3;`;
      const result = await numbersToExpressionsPass.transform(code, createContext());
      expect(result).toContain('5');
    });

    it('should not simplify non-constant expressions', async () => {
      const code = `var x = y + 3;`;
      const result = await numbersToExpressionsPass.transform(code, createContext());
      expect(result).toContain('y + 3');
    });
  });

  // ==========================================================
  // Object Keys
  // ==========================================================
  describe('object-keys pass', () => {
    it('should inline readonly literal object properties', async () => {
      const code = `var obj = { a: 1, b: "hello" };\nconsole.log(obj.a);\nconsole.log(obj.b);`;
      const result = await objectKeysPass.transform(code, createContext());
      expect(result).toContain('1');
      expect(result).toContain('"hello"');
    });

    it('should not inline if object has non-literal properties', async () => {
      const code = `var obj = { a: 1, b: fn() };\nconsole.log(obj.a);`;
      const result = await objectKeysPass.transform(code, createContext());
      // Should not inline since not all properties are literals
      expect(result).toContain('obj.a');
    });
  });

  // ==========================================================
  // Self Defending
  // ==========================================================
  describe('self-defending pass', () => {
    it('should remove self-defending code with ReDoS pattern', async () => {
      const code = `
function _0xself() {
  var _0xresult = new RegExp('test');
  return _0xself.toString().search('(((.+)+)+)+$').toString().constructor('return "test"')();
}
_0xself();
console.log("real code");`;
      const result = await selfDefendingPass.transform(code, createContext());
      expect(result).not.toContain('(((.+)+)+)+$');
      expect(result).toContain('real code');
    });

    it('should not modify code without self-defending patterns', async () => {
      const code = `console.log("hello");`;
      const result = await selfDefendingPass.transform(code, createContext());
      expect(result).toBe(code);
    });
  });

  // ==========================================================
  // Debug Protection
  // ==========================================================
  describe('debug-protection pass', () => {
    it('should remove debugger statements', async () => {
      const code = `debugger;\nconsole.log("hello");`;
      const result = await debugProtectionPass.transform(code, createContext());
      expect(result).not.toContain('debugger');
      expect(result).toContain('hello');
    });

    it('should remove debug protection functions', async () => {
      const code = `
function _0xdebug(counter) {
  debugger;
  _0xdebug(++counter);
}
_0xdebug(0);
console.log("real");`;
      const result = await debugProtectionPass.transform(code, createContext());
      expect(result).not.toContain('debugger');
      expect(result).toContain('real');
    });

    it('should not modify code without debug patterns', async () => {
      const code = `console.log("hello");`;
      const result = await debugProtectionPass.transform(code, createContext());
      expect(result).toBe(code);
    });
  });

  // ==========================================================
  // Console Output
  // ==========================================================
  describe('console-output pass', () => {
    it('should remove console-disabling IIFEs', async () => {
      const code = `
(function() {
  var _0xnames = ['log', 'warn', 'info', 'error', 'exception', 'table', 'trace'];
  for (var i = 0; i < _0xnames.length; i++) {
    console[_0xnames[i]] = function() {};
  }
})();
console.log("real");`;
      const result = await consoleOutputPass.transform(code, createContext());
      expect(result).not.toContain("'log'");
      expect(result).toContain('real');
    });

    it('should not modify code without console manipulation', async () => {
      const code = `console.log("hello");`;
      const result = await consoleOutputPass.transform(code, createContext());
      expect(result).toBe(code);
    });
  });

  // ==========================================================
  // Domain Lock
  // ==========================================================
  describe('domain-lock pass', () => {
    it('should remove domain lock IIFEs', async () => {
      const code = `
(function() {
  var _0xhost = window.location.hostname;
  if (_0xhost.match(/allowed\\.com/) === null) {
    window.location.href = "https://example.com";
  }
})();
console.log("real");`;
      const result = await domainLockPass.transform(code, createContext());
      expect(result).toContain('real');
      expect(result).not.toContain('allowed');
    });

    it('should not modify code without domain lock patterns', async () => {
      const code = `console.log("hello");`;
      const result = await domainLockPass.transform(code, createContext());
      expect(result).toBe(code);
    });
  });

  // ==========================================================
  // Unminify
  // ==========================================================
  describe('unminify pass', () => {
    it('should convert computed properties to dot notation', async () => {
      const code = `obj["hello"] = 1;`;
      const result = await unminifyPass.transform(code, createContext());
      expect(result).toContain('obj.hello');
      expect(result).not.toContain('["hello"]');
    });

    it('should not convert computed properties with reserved words', async () => {
      const code = `obj["class"] = 1;`;
      const result = await unminifyPass.transform(code, createContext());
      expect(result).toContain('["class"]');
    });

    it('should convert void 0 to undefined', async () => {
      const code = `var x = void 0;`;
      const result = await unminifyPass.transform(code, createContext());
      expect(result).toContain('undefined');
      expect(result).not.toContain('void 0');
    });

    it('should flip yoda conditions', async () => {
      const code = `if ("string" === x) {}`;
      const result = await unminifyPass.transform(code, createContext());
      expect(result).toContain('x === "string"');
    });

    it('should convert for(;;) to while(true)', async () => {
      const code = `for (;;) { break; }`;
      const result = await unminifyPass.transform(code, createContext());
      expect(result).toContain('while');
      expect(result).toContain('true');
    });

    it('should convert 1/0 to Infinity', async () => {
      const code = `var x = 1 / 0;`;
      const result = await unminifyPass.transform(code, createContext());
      expect(result).toContain('Infinity');
    });

    it('should convert sequence expressions to statements', async () => {
      const code = `a(), b(), c();`;
      const result = await unminifyPass.transform(code, createContext());
      expect(result).toContain('a();\n');
      expect(result).toContain('b();\n');
      expect(result).toContain('c();');
    });

    it('should split variable declarations', async () => {
      const code = `var a = 1, b = 2, c = 3;`;
      const result = await unminifyPass.transform(code, createContext());
      expect(result).toContain('var a = 1;');
      expect(result).toContain('var b = 2;');
      expect(result).toContain('var c = 3;');
    });

    it('should convert ternary to if/else at statement level', async () => {
      const code = `x ? a() : b();`;
      const result = await unminifyPass.transform(code, createContext());
      expect(result).toContain('if');
      expect(result).toContain('else');
    });

    it('should convert logical && to if at statement level', async () => {
      const code = `x && doSomething();`;
      const result = await unminifyPass.transform(code, createContext());
      expect(result).toContain('if');
      expect(result).toContain('doSomething');
    });

    it('should evaluate JSON.parse with literal argument', async () => {
      const code = `var x = JSON.parse('{"a":1,"b":"hello"}');`;
      const result = await unminifyPass.transform(code, createContext());
      expect(result).toContain('a:');
      expect(result).toContain('1');
      expect(result).toContain('"hello"');
    });

    it('should merge else { if } to else if', async () => {
      const code = `if (a) { x(); } else { if (b) { y(); } }`;
      const result = await unminifyPass.transform(code, createContext());
      // The result should have "else if" not "else {\n  if"
      expect(result).toContain('else if');
    });
  });
});
