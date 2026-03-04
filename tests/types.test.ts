import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  PreludeDetectionResultSchema,
  CascadeResultSchema,
  DeobfuscationStatsSchema,
  CascadeOptionsSchema,
  SandboxOptionsSchema,
  LLMOptionsSchema,
  TaggedStatementSchema,
  PreludeTemplate,
} from '../src/types';

// ============================================================================
// PreludeDetectionResult Schema Tests
// ============================================================================

describe('PreludeDetectionResultSchema', () => {
  it('should validate a valid PreludeDetectionResult', () => {
    const validData = {
      stringArrayId: 123,
      stringFetcherId: 456,
      rotateId: 789,
      raw: { someKey: 'someValue' },
    };
    expect(() => PreludeDetectionResultSchema.parse(validData)).not.toThrow();
  });

  it('should validate with null values for numeric fields', () => {
    const validData = {
      stringArrayId: null,
      stringFetcherId: null,
      rotateId: null,
      raw: null,
    };
    expect(() => PreludeDetectionResultSchema.parse(validData)).not.toThrow();
  });

  it('should validate with mixed null and numeric values', () => {
    const validData = {
      stringArrayId: 123,
      stringFetcherId: null,
      rotateId: 456,
      raw: { key: 'value' },
    };
    expect(() => PreludeDetectionResultSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid data - string instead of number', () => {
    const invalidData = {
      stringArrayId: 'not a number',
      stringFetcherId: 456,
      rotateId: 789,
      raw: {},
    };
    expect(() => PreludeDetectionResultSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject data with missing required fields', () => {
    const invalidData = {
      stringArrayId: 123,
      // missing stringFetcherId
      rotateId: 789,
      raw: {},
    };
    expect(() => PreludeDetectionResultSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject data with extra fields', () => {
    const validData = {
      stringArrayId: 123,
      stringFetcherId: 456,
      rotateId: 789,
      raw: {},
      extraField: 'should be ignored or rejected',
    };
    // Zod by default strips extra fields
    const result = PreludeDetectionResultSchema.parse(validData);
    expect(result).not.toHaveProperty('extraField');
  });
});

// ============================================================================
// DeobfuscationStats Schema Tests
// ============================================================================

describe('DeobfuscationStatsSchema', () => {
  it('should validate a valid DeobfuscationStats object', () => {
    const validData = {
      recoveredLiterals: 42,
      passesApplied: ['pass1', 'pass2', 'pass3'],
      timingMs: { pass1: 100, pass2: 200, pass3: 150 },
      preludeDetected: true,
    };
    expect(() => DeobfuscationStatsSchema.parse(validData)).not.toThrow();
  });

  it('should validate with empty arrays and records', () => {
    const validData = {
      recoveredLiterals: 0,
      passesApplied: [],
      timingMs: {},
      preludeDetected: false,
    };
    expect(() => DeobfuscationStatsSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid - non-number recoveredLiterals', () => {
    const invalidData = {
      recoveredLiterals: 'not a number',
      passesApplied: [],
      timingMs: {},
      preludeDetected: false,
    };
    expect(() => DeobfuscationStatsSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - non-boolean preludeDetected', () => {
    const invalidData = {
      recoveredLiterals: 42,
      passesApplied: [],
      timingMs: {},
      preludeDetected: 'true', // string instead of boolean
    };
    expect(() => DeobfuscationStatsSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - passesApplied with non-string values', () => {
    const invalidData = {
      recoveredLiterals: 42,
      passesApplied: ['pass1', 123, 'pass3'], // 123 is not a string
      timingMs: {},
      preludeDetected: false,
    };
    expect(() => DeobfuscationStatsSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - timingMs with non-number values', () => {
    const invalidData = {
      recoveredLiterals: 42,
      passesApplied: [],
      timingMs: { pass1: 'not a number' }, // string instead of number
      preludeDetected: false,
    };
    expect(() => DeobfuscationStatsSchema.parse(invalidData)).toThrow(z.ZodError);
  });
});

// ============================================================================
// CascadeResult Schema Tests
// ============================================================================

describe('CascadeResultSchema', () => {
  it('should validate a complete valid CascadeResult', () => {
    const validData = {
      code: 'const x = 123;',
      success: true,
      warnings: ['warning1', 'warning2'],
      errors: [],
      stats: {
        recoveredLiterals: 10,
        passesApplied: ['deobfuscate', 'simplify'],
        timingMs: { deobfuscate: 100, simplify: 50 },
        preludeDetected: true,
      },
    };
    expect(() => CascadeResultSchema.parse(validData)).not.toThrow();
  });

  it('should validate with empty warnings and errors arrays', () => {
    const validData = {
      code: '',
      success: false,
      warnings: [],
      errors: [],
      stats: {
        recoveredLiterals: 0,
        passesApplied: [],
        timingMs: {},
        preludeDetected: false,
      },
    };
    expect(() => CascadeResultSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid - code is not a string', () => {
    const invalidData = {
      code: 12345, // number instead of string
      success: true,
      warnings: [],
      errors: [],
      stats: {
        recoveredLiterals: 0,
        passesApplied: [],
        timingMs: {},
        preludeDetected: false,
      },
    };
    expect(() => CascadeResultSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - success is not a boolean', () => {
    const invalidData = {
      code: 'const x = 123;',
      success: 'yes', // string instead of boolean
      warnings: [],
      errors: [],
      stats: {
        recoveredLiterals: 0,
        passesApplied: [],
        timingMs: {},
        preludeDetected: false,
      },
    };
    expect(() => CascadeResultSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - invalid nested stats', () => {
    const invalidData = {
      code: 'const x = 123;',
      success: true,
      warnings: [],
      errors: [],
      stats: {
        recoveredLiterals: 'not a number', // invalid
        passesApplied: [],
        timingMs: {},
        preludeDetected: false,
      },
    };
    expect(() => CascadeResultSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - warnings is not an array of strings', () => {
    const invalidData = {
      code: 'const x = 123;',
      success: true,
      warnings: ['warning1', 123], // 123 is not a string
      errors: [],
      stats: {
        recoveredLiterals: 0,
        passesApplied: [],
        timingMs: {},
        preludeDetected: false,
      },
    };
    expect(() => CascadeResultSchema.parse(invalidData)).toThrow(z.ZodError);
  });
});

// ============================================================================
// CascadeOptions Schema Tests
// ============================================================================

describe('CascadeOptionsSchema', () => {
  it('should validate with optional timeout and debug', () => {
    const validData = {
      timeout: 5000,
      debug: true,
    };
    expect(() => CascadeOptionsSchema.parse(validData)).not.toThrow();
  });

  it('should validate with empty object', () => {
    const validData = {};
    expect(() => CascadeOptionsSchema.parse(validData)).not.toThrow();
  });

  it('should validate with only timeout', () => {
    const validData = {
      timeout: 3000,
    };
    expect(() => CascadeOptionsSchema.parse(validData)).not.toThrow();
  });

  it('should validate with only debug', () => {
    const validData = {
      debug: false,
    };
    expect(() => CascadeOptionsSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid - timeout is not a number', () => {
    const invalidData = {
      timeout: 'not a number',
      debug: true,
    };
    expect(() => CascadeOptionsSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - debug is not a boolean', () => {
    const invalidData = {
      timeout: 5000,
      debug: 'yes', // string instead of boolean
    };
    expect(() => CascadeOptionsSchema.parse(invalidData)).toThrow(z.ZodError);
  });
});

// ============================================================================
// SandboxOptions Schema Tests
// ============================================================================

describe('SandboxOptionsSchema', () => {
  it('should validate with memoryLimit and timeout', () => {
    const validData = {
      memoryLimit: 1024 * 1024 * 100, // 100MB
      timeout: 5000,
    };
    expect(() => SandboxOptionsSchema.parse(validData)).not.toThrow();
  });

  it('should validate with empty object', () => {
    const validData = {};
    expect(() => SandboxOptionsSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid - memoryLimit is not a number', () => {
    const invalidData = {
      memoryLimit: 'not a number',
      timeout: 5000,
    };
    expect(() => SandboxOptionsSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - timeout is not a number', () => {
    const invalidData = {
      memoryLimit: 1024,
      timeout: 'not a number',
    };
    expect(() => SandboxOptionsSchema.parse(invalidData)).toThrow(z.ZodError);
  });
});

// ============================================================================
// LLMOptions Schema Tests
// ============================================================================

describe('LLMOptionsSchema', () => {
  it('should validate with timeout and model', () => {
    const validData = {
      timeout: 30000,
      model: 'gpt-4',
    };
    expect(() => LLMOptionsSchema.parse(validData)).not.toThrow();
  });

  it('should validate with empty object', () => {
    const validData = {};
    expect(() => LLMOptionsSchema.parse(validData)).not.toThrow();
  });

  it('should validate with only timeout', () => {
    const validData = {
      timeout: 10000,
    };
    expect(() => LLMOptionsSchema.parse(validData)).not.toThrow();
  });

  it('should validate with only model', () => {
    const validData = {
      model: 'claude-3',
    };
    expect(() => LLMOptionsSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid - timeout is not a number', () => {
    const invalidData = {
      timeout: 'not a number',
      model: 'gpt-4',
    };
    expect(() => LLMOptionsSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - model is not a string', () => {
    const invalidData = {
      timeout: 30000,
      model: 12345, // number instead of string
    };
    expect(() => LLMOptionsSchema.parse(invalidData)).toThrow(z.ZodError);
  });
});

// ============================================================================
// TaggedStatement Schema Tests
// ============================================================================

describe('TaggedStatementSchema', () => {
  it('should validate a complete valid TaggedStatement', () => {
    const validData = {
      id: 1,
      code: 'const x = 123;',
      start: 0,
      end: 14,
    };
    expect(() => TaggedStatementSchema.parse(validData)).not.toThrow();
  });

  it('should validate with zero values', () => {
    const validData = {
      id: 0,
      code: '',
      start: 0,
      end: 0,
    };
    expect(() => TaggedStatementSchema.parse(validData)).not.toThrow();
  });

  it('should reject invalid - id is not a number', () => {
    const invalidData = {
      id: 'not a number',
      code: 'const x = 123;',
      start: 0,
      end: 14,
    };
    expect(() => TaggedStatementSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - code is not a string', () => {
    const invalidData = {
      id: 1,
      code: 12345, // number instead of string
      start: 0,
      end: 14,
    };
    expect(() => TaggedStatementSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - start is not a number', () => {
    const invalidData = {
      id: 1,
      code: 'const x = 123;',
      start: 'not a number',
      end: 14,
    };
    expect(() => TaggedStatementSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject invalid - end is not a number', () => {
    const invalidData = {
      id: 1,
      code: 'const x = 123;',
      start: 0,
      end: 'not a number',
    };
    expect(() => TaggedStatementSchema.parse(invalidData)).toThrow(z.ZodError);
  });

  it('should reject incomplete data - missing fields', () => {
    const invalidData = {
      id: 1,
      code: 'const x = 123;',
      // missing start and end
    };
    expect(() => TaggedStatementSchema.parse(invalidData)).toThrow(z.ZodError);
  });
});

// ============================================================================
// Enum Tests
// ============================================================================

describe('PreludeTemplate Enum', () => {
  it('should have correct enum values', () => {
    expect(PreludeTemplate.StringArrayTemplate).toBe('StringArrayTemplate');
    expect(PreludeTemplate.StringArrayCallsWrapperTemplate).toBe('StringArrayCallsWrapperTemplate');
    expect(PreludeTemplate.StringArrayRotateFunctionTemplate).toBe('StringArrayRotateFunctionTemplate');
  });

  it('should have exactly 3 enum members', () => {
    const members = Object.values(PreludeTemplate);
    expect(members).toHaveLength(3);
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Type Guards and Inferred Types', () => {
  it('should infer correct type from PreludeDetectionResultSchema', () => {
    const data = {
      stringArrayId: 123,
      stringFetcherId: 456,
      rotateId: 789,
      raw: { key: 'value' },
    };
    const result = PreludeDetectionResultSchema.parse(data);
    expect(result).toBeDefined();
    expect(result.stringArrayId).toBe(123);
  });

  it('should infer correct type from CascadeResultSchema', () => {
    const data = {
      code: 'const x = 123;',
      success: true,
      warnings: [],
      errors: [],
      stats: {
        recoveredLiterals: 10,
        passesApplied: ['pass1'],
        timingMs: { pass1: 100 },
        preludeDetected: true,
      },
    };
    const result = CascadeResultSchema.parse(data);
    expect(result.success).toBe(true);
    expect(result.stats.recoveredLiterals).toBe(10);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Schema Integration', () => {
  it('should validate CascadeResult with CascadeOptions schema', () => {
    const options = {
      timeout: 5000,
      debug: true,
    };
    expect(() => CascadeOptionsSchema.parse(options)).not.toThrow();
  });

  it('should compose schemas correctly', () => {
    const result = {
      code: 'const x = 123;',
      success: true,
      warnings: ['warning1'],
      errors: [],
      stats: {
        recoveredLiterals: 5,
        passesApplied: ['pass1', 'pass2'],
        timingMs: { pass1: 50, pass2: 25 },
        preludeDetected: false,
      },
    };

    const cascadeResult = CascadeResultSchema.parse(result);
    const stats = DeobfuscationStatsSchema.parse(cascadeResult.stats);

    expect(stats.recoveredLiterals).toBe(5);
    expect(stats.passesApplied).toHaveLength(2);
  });
});
