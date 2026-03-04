import { describe, it, expect } from 'vitest';
import { parseAndTag, countStatements } from '../../src/transform/splitter.js';

describe('Statement Splitter & Tagger', () => {
  describe('parseAndTag()', () => {
    it('parses and tags simple statements', () => {
      const code = `console.log('Hello'); var x = 1;`;
      const result = parseAndTag(code);
      
      expect(result.ast).toBeDefined();
      expect(result.ast.type).toBe('File');
      expect(result.statements).toHaveLength(2);
      expect(result.statements[0].id).toBe(0);
      expect(result.statements[0].code).toBe("console.log('Hello');");
      expect(result.statements[1].id).toBe(1);
      expect(result.statements[1].code).toBe('var x = 1;');
    });

    it('handles function declarations', () => {
      const code = `function greet() { console.log('hi'); }`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].code).toContain('function greet()');
      expect(result.statements[0].code).toContain('console.log');
    });

    it('handles multiple function declarations', () => {
      const code = `
function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}
`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(2);
      expect(result.statements[0].code).toContain('function add');
      expect(result.statements[1].code).toContain('function multiply');
    });

    it('throws on syntax errors', () => {
      const code = `function { broken }`;
      expect(() => parseAndTag(code)).toThrow();
    });

    it('handles empty code', () => {
      const result = parseAndTag('');
      expect(result.statements).toHaveLength(0);
      expect(result.ast).toBeDefined();
    });

    it('handles whitespace-only code', () => {
      const result = parseAndTag('   \n\n  \t  ');
      expect(result.statements).toHaveLength(0);
    });

    it('assigns sequential IDs', () => {
      const code = `a; b; c; d;`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(4);
      result.statements.forEach((stmt, i) => {
        expect(stmt.id).toBe(i);
      });
    });

    it('tracks correct start/end positions', () => {
      const code = `  var x = 1;  `;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      const stmt = result.statements[0];
      expect(code.slice(stmt.start, stmt.end)).toBe('var x = 1;');
    });

    it('handles multi-line statements correctly', () => {
      const code = `var obj = {
  a: 1,
  b: 2,
  c: 3
};`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      const stmt = result.statements[0];
      expect(stmt.code).toContain('var obj = {');
      expect(stmt.code).toContain('c: 3');
      expect(code.slice(stmt.start, stmt.end)).toBe(stmt.code);
    });

    it('handles if statements', () => {
      const code = `
if (x > 0) {
  console.log('positive');
}
`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].code).toContain('if (x > 0)');
    });

    it('handles for loops', () => {
      const code = `for (let i = 0; i < 10; i++) { sum += i; }`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].code).toContain('for (let i = 0');
    });

    it('handles class declarations', () => {
      const code = `
class Person {
  constructor(name) {
    this.name = name;
  }
  
  greet() {
    return 'Hello, ' + this.name;
  }
}
`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].code).toContain('class Person');
    });

    it('handles import/export statements', () => {
      const code = `
import { foo } from './bar.js';
export const x = 42;
export default function test() {}
`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(3);
      expect(result.statements[0].code).toContain('import');
      expect(result.statements[1].code).toContain('export const x');
      expect(result.statements[2].code).toContain('export default');
    });

    it('handles try-catch statements', () => {
      const code = `
try {
  riskyOperation();
} catch (error) {
  console.error(error);
}
`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].code).toContain('try {');
      expect(result.statements[0].code).toContain('catch (error)');
    });

    it('handles arrow functions as expressions', () => {
      const code = `const add = (a, b) => a + b;`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].code).toBe('const add = (a, b) => a + b;');
    });

    it('handles obfuscated-style code', () => {
      const code = `var _0x1234=['string1','string2'];function _0x5678(){return _0x1234;}`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(2);
      expect(result.statements[0].code).toContain('_0x1234');
      expect(result.statements[1].code).toContain('_0x5678');
    });

    it('preserves exact character positions', () => {
      const code = `a;\nb;\nc;`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(3);
      expect(result.statements[0].start).toBe(0);
      expect(result.statements[0].end).toBe(2);
      expect(result.statements[1].start).toBe(3);
      expect(result.statements[1].end).toBe(5);
      expect(result.statements[2].start).toBe(6);
      expect(result.statements[2].end).toBe(8);
    });
  });

  describe('countStatements()', () => {
    it('counts simple statements', () => {
      expect(countStatements('a; b; c;')).toBe(3);
    });

    it('counts zero statements for empty code', () => {
      expect(countStatements('')).toBe(0);
    });

    it('counts complex statements', () => {
      const code = `
var x = 1;
function test() { return x; }
class Foo {}
if (true) { console.log('hi'); }
`;
      expect(countStatements(code)).toBe(4);
    });

    it('counts a single statement', () => {
      expect(countStatements('console.log("test");')).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles comments between statements', () => {
      const code = `
// Comment 1
var x = 1;
/* Multi-line
   comment */
var y = 2;
`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(2);
    });

    it('handles semicolon-less code', () => {
      const code = `var x = 1\nvar y = 2\nvar z = 3`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(3);
    });

    it('handles immediately invoked function expressions', () => {
      const code = `(function() { console.log('IIFE'); })();`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].code).toContain('IIFE');
    });

    it('handles template literals', () => {
      const code = 'const msg = `Hello ${name}`;';
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].code).toContain('`Hello ${name}`');
    });

    it('handles async/await', () => {
      const code = `
async function fetchData() {
  const result = await fetch('/api');
  return result.json();
}
`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].code).toContain('async function');
    });

    it('handles destructuring', () => {
      const code = `const { a, b } = obj; const [x, y] = arr;`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(2);
      expect(result.statements[0].code).toContain('{ a, b }');
      expect(result.statements[1].code).toContain('[x, y]');
    });

    it('handles spread operator', () => {
      const code = `const merged = { ...obj1, ...obj2 };`;
      const result = parseAndTag(code);
      
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].code).toContain('...');
    });
  });
});
