import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicLLMAdapter } from '../../src/llm/anthropic-adapter.js';
import type { TaggedStatement } from '../../src/types.js';
import Anthropic from '@anthropic-ai/sdk';

vi.mock('@anthropic-ai/sdk');

describe('AnthropicLLMAdapter', () => {
  let adapter: AnthropicLLMAdapter;
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
    adapter = new AnthropicLLMAdapter('test-api-key', 'claude-3-haiku-20240307');
  });

  it('should initialize with correct name and default model', () => {
    expect(adapter.name).toBe('anthropic');
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
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            stringArrayId: 0,
            stringFetcherId: 1,
            rotateId: null,
          }),
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    (Anthropic as any).mockImplementation(function (this: any) {
      this.messages = {
        create: mockCreate,
      };
    });

    adapter = new AnthropicLLMAdapter('test-api-key');
    const result = await adapter.detectPrelude(mockStatements);

    expect(result.stringArrayId).toBe(0);
    expect(result.stringFetcherId).toBe(1);
    expect(result.rotateId).toBe(null);
    expect(result.raw).toEqual(mockResponse);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        temperature: 0.1,
        system: expect.stringContaining('JavaScript deobfuscation expert'),
        messages: expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
      })
    );
  });

  it('should throw error when response is empty', async () => {
    const mockResponse = {
      content: [],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    (Anthropic as any).mockImplementation(function (this: any) {
      this.messages = {
        create: mockCreate,
      };
    });

    adapter = new AnthropicLLMAdapter('test-api-key');

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow('Empty response from Anthropic');
  });

  it('should throw error when response content is not text', async () => {
    const mockResponse = {
      content: [
        {
          type: 'image',
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    (Anthropic as any).mockImplementation(function (this: any) {
      this.messages = {
        create: mockCreate,
      };
    });

    adapter = new AnthropicLLMAdapter('test-api-key');

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow('Empty response from Anthropic');
  });

  it('should throw error when response JSON is invalid', async () => {
    const mockResponse = {
      content: [
        {
          type: 'text',
          text: 'invalid json',
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    (Anthropic as any).mockImplementation(function (this: any) {
      this.messages = {
        create: mockCreate,
      };
    });

    adapter = new AnthropicLLMAdapter('test-api-key');

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow();
  });

  it('should throw error when response schema is invalid', async () => {
    const mockResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            stringArrayId: 'not-a-number',
            stringFetcherId: 1,
            rotateId: null,
          }),
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    (Anthropic as any).mockImplementation(function (this: any) {
      this.messages = {
        create: mockCreate,
      };
    });

    adapter = new AnthropicLLMAdapter('test-api-key');

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow();
  });

  it('should use custom model from options', async () => {
    const mockResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            stringArrayId: null,
            stringFetcherId: null,
            rotateId: null,
          }),
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    (Anthropic as any).mockImplementation(function (this: any) {
      this.messages = {
        create: mockCreate,
      };
    });

    adapter = new AnthropicLLMAdapter('test-api-key');
    await adapter.detectPrelude(mockStatements, { model: 'claude-3-opus-20240229' });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-3-opus-20240229',
      })
    );
  });

  it('should pass custom baseURL to Anthropic client', async () => {
    const mockResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            stringArrayId: null,
            stringFetcherId: null,
            rotateId: null,
          }),
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    const constructorSpy = vi.fn();
    (Anthropic as any).mockImplementation(function (this: any, opts: any) {
      constructorSpy(opts);
      this.messages = {
        create: mockCreate,
      };
    });

    const customBaseURL = 'https://custom-api.example.com/v1';
    adapter = new AnthropicLLMAdapter('test-api-key', 'claude-3-haiku-20240307', customBaseURL);
    await adapter.detectPrelude(mockStatements);

    expect(constructorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-api-key',
        baseURL: customBaseURL,
      })
    );
  });

  it('should not include baseURL in Anthropic client when not provided', async () => {
    const mockResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            stringArrayId: null,
            stringFetcherId: null,
            rotateId: null,
          }),
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    const constructorSpy = vi.fn();
    (Anthropic as any).mockImplementation(function (this: any, opts: any) {
      constructorSpy(opts);
      this.messages = {
        create: mockCreate,
      };
    });

    adapter = new AnthropicLLMAdapter('test-api-key');
    await adapter.detectPrelude(mockStatements);

    const calledWith = constructorSpy.mock.calls[0][0];
    expect(calledWith).toEqual({ apiKey: 'test-api-key' });
    expect(calledWith).not.toHaveProperty('baseURL');
  });
});
