import { describe, it, expect, vi, beforeEach } from 'vitest';
import { booleanLiteralsPass } from '../../../src/transform/extensions/boolean-literals.js';
import { controlFlowFlatteningPass } from '../../../src/transform/extensions/control-flow-flattening.js';
import { deadCodeRemovalPass } from '../../../src/transform/extensions/dead-code-removal.js';
import type { PipelineContext } from '../../../src/pipeline/pipeline.js';

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Spy on console.warn
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

// Mock context
const mockContext: PipelineContext = {
  options: {},
  prelude: null,
  recoveredStrings: new Map(),
  stats: {
    recoveredLiterals: 0,
    passesApplied: [],
    timingMs: {},
    preludeDetected: false,
  },
  logger: mockLogger,
  shared: {
    passesApplied: [],
  },
};

describe('Extension Passes', () => {
  beforeEach(() => {
    consoleWarnSpy.mockClear();
  });
  describe('boolean-literals pass', () => {
    it('should transform ![] to false', async () => {
      const code = 'const x = ![];';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('false');
      expect(result).not.toContain('![]');
    });

    it('should transform !![] to true', async () => {
      const code = 'const x = !![];';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('true');
      expect(result).not.toContain('!![]');
    });

    it('should transform !0 to true', async () => {
      const code = 'const x = !0;';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('true');
      expect(result).not.toContain('!0');
    });

    it('should transform !1 to false', async () => {
      const code = 'const x = !1;';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('false');
      expect(result).not.toContain('!1');
    });

    it('should transform !\'\' to true', async () => {
      const code = 'const x = !\'\';';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('true');
      expect(result).not.toContain('!\'\'');
    });

    it('should transform !!\'\' to false', async () => {
      const code = 'const x = !!\'\';';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('false');
      expect(result).not.toContain('!!\'\'');
    });

    it('should handle multiple transformations in one code block', async () => {
      const code = 'const a = ![]; const b = !0; const c = !\'\';';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('false');
      expect(result).toContain('true');
    });

    it('should not transform non-literal NOT operations', async () => {
      const code = 'const x = !y;';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('!y');
    });

    it('should track pass application in context', async () => {
      const context = {
        ...mockContext,
        shared: { passesApplied: [] },
      };
      await booleanLiteralsPass.transform('const x = ![];', context);
      expect(context.shared?.passesApplied).toContain('boolean-literals');
    });

    it('should handle !null transformation', async () => {
      const code = 'const x = !null;';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('true');
    });

    it('should handle !!null transformation', async () => {
      const code = 'const x = !!null;';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('false');
    });

    it('should handle !true transformation', async () => {
      const code = 'const x = !true;';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('false');
    });

    it('should handle !false transformation', async () => {
      const code = 'const x = !false;';
      const result = await booleanLiteralsPass.transform(code, mockContext);
      expect(result).toContain('true');
    });
  });

  describe('control-flow-flattening pass (stub)', () => {
    it('should return code unchanged', async () => {
      const code = 'const x = 1; if (x) { console.log("test"); }';
      const result = await controlFlowFlatteningPass.transform(code, mockContext);
      expect(result).toBe(code);
    });

    it('should log warning message', async () => {
      mockLogger.warn.mockClear();
      const code = 'const x = 1;';
      await controlFlowFlatteningPass.transform(code, mockContext);
      expect(consoleWarnSpy).toHaveBeenCalledWith('[STUB] control-flow-flattening not yet implemented');
    });

    it('should work with complex code', async () => {
      const code = `
        function test() {
          let state = 0;
          while (true) {
            switch (state) {
              case 0: console.log('a'); state = 1; break;
              case 1: console.log('b'); state = -1; break;
            }
            if (state === -1) break;
          }
        }
      `;
      const result = await controlFlowFlatteningPass.transform(code, mockContext);
      expect(result).toBe(code);
    });
  });

  describe('dead-code-removal pass (stub)', () => {
    it('should return code unchanged', async () => {
      const code = 'const x = 1; const y = 2;';
      const result = await deadCodeRemovalPass.transform(code, mockContext);
      expect(result).toBe(code);
    });

    it('should log warning message', async () => {
      mockLogger.warn.mockClear();
      const code = 'const x = 1;';
      await deadCodeRemovalPass.transform(code, mockContext);
      expect(consoleWarnSpy).toHaveBeenCalledWith('[STUB] dead-code-removal not yet implemented');
    });

    it('should work with potentially dead code', async () => {
      const code = `
        const x = 1;
        if (false) {
          console.log('unreachable');
        }
        const y = 2;
      `;
      const result = await deadCodeRemovalPass.transform(code, mockContext);
      expect(result).toBe(code);
    });
  });
});
