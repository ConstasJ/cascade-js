import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAILLMAdapter } from '../../src/llm/openai-adapter.js';
import type { TaggedStatement } from '../../src/types.js';
import OpenAI from 'openai';

vi.mock('openai');

describe('OpenAILLMAdapter', () => {
  let adapter: OpenAILLMAdapter;
  const mockStatements: TaggedStatement[] = [
    {
      id: 0,
      code: 'const _0x1234 = ["hello", "world"];',
      start: 0,
      end: 38,
    },
    {
      id: 1,
      code: 'function _0xabcd(idx) { return _0x1234[idx]; }',
      start: 39,
      end: 85,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new OpenAILLMAdapter('test-api-key', 'gpt-4o-mini');
  });

  it('should initialize with correct name and default model', () => {
    expect(adapter.name).toBe('openai');
  });

  it('should build correct prompt from statements', () => {
    const prompt = (adapter as any).buildPrompt(mockStatements);

    expect(prompt).toContain('[0] const _0x1234 = ["hello", "world"];');
    expect(prompt).toContain('[1] function _0xabcd(idx) { return _0x1234[idx]; }');
    expect(prompt).toContain('string array variable ID');
    expect(prompt).toContain('string fetcher function ID');
    expect(prompt).toContain('rotate function ID');
    expect(prompt).toContain('JSON format');
  });

  it('should successfully detect prelude with valid response', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              stringArrayId: 0,
              stringFetcherId: 1,
              rotateId: null,
            }),
          },
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    (OpenAI as any).mockImplementation(function (this: any) {
      this.chat = {
        completions: {
          create: mockCreate,
        },
      };
    });

    adapter = new OpenAILLMAdapter('test-api-key');
    const result = await adapter.detectPrelude(mockStatements);

    expect(result.stringArrayId).toBe(0);
    expect(result.stringFetcherId).toBe(1);
    expect(result.rotateId).toBe(null);
    expect(result.raw).toEqual(mockResponse);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        max_tokens: 500,
        temperature: 0.1,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
      })
    );
  });

  it('should throw error when response is empty', async () => {
    const mockResponse = {
      choices: [{ message: { content: null } }],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    (OpenAI as any).mockImplementation(function (this: any) {
      this.chat = {
        completions: {
          create: mockCreate,
        },
      };
    });

    adapter = new OpenAILLMAdapter('test-api-key');

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow('Empty response from OpenAI');
  });

  it('should throw error when response JSON is invalid', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: 'invalid json',
          },
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    (OpenAI as any).mockImplementation(function (this: any) {
      this.chat = {
        completions: {
          create: mockCreate,
        },
      };
    });

    adapter = new OpenAILLMAdapter('test-api-key');

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow();
  });

  it('should throw error when response schema is invalid', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              stringArrayId: 'not-a-number',
              stringFetcherId: 1,
              rotateId: null,
            }),
          },
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    (OpenAI as any).mockImplementation(function (this: any) {
      this.chat = {
        completions: {
          create: mockCreate,
        },
      };
    });

    adapter = new OpenAILLMAdapter('test-api-key');

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow();
  });

  it('should use custom model from options', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              stringArrayId: null,
              stringFetcherId: null,
              rotateId: null,
            }),
          },
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    (OpenAI as any).mockImplementation(function (this: any) {
      this.chat = {
        completions: {
          create: mockCreate,
        },
      };
    });

    adapter = new OpenAILLMAdapter('test-api-key');
    await adapter.detectPrelude(mockStatements, { model: 'gpt-4-turbo' });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4-turbo',
      })
    );
  });
});
