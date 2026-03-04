import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaLLMAdapter } from '../../src/llm/ollama-adapter.js';
import type { TaggedStatement } from '../../src/types.js';
import { Ollama } from 'ollama';

vi.mock('ollama');

describe('OllamaLLMAdapter', () => {
  let adapter: OllamaLLMAdapter;
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
    adapter = new OllamaLLMAdapter('llama3.2', 'http://localhost:11434');
  });

  it('should initialize with correct name and default model', () => {
    expect(adapter.name).toBe('ollama');
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
      response: JSON.stringify({
        stringArrayId: 0,
        stringFetcherId: 1,
        rotateId: null,
      }),
    };

    const mockGenerate = vi.fn().mockResolvedValue(mockResponse);
    (Ollama as any).mockImplementation(function(this: any) {
      this.generate = mockGenerate;
    });

    adapter = new OllamaLLMAdapter();
    const result = await adapter.detectPrelude(mockStatements);

    expect(result.stringArrayId).toBe(0);
    expect(result.stringFetcherId).toBe(1);
    expect(result.rotateId).toBe(null);
    expect(result.raw).toEqual(mockResponse);

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'llama3.2',
        prompt: expect.any(String),
        system: expect.stringContaining('JavaScript deobfuscation expert'),
        format: 'json',
        options: {
          temperature: 0.1,
        },
      })
    );
  });

  it('should throw error when response is empty', async () => {
    const mockResponse = {
      response: '',
    };

    const mockGenerate = vi.fn().mockResolvedValue(mockResponse);
    (Ollama as any).mockImplementation(function(this: any) {
      this.generate = mockGenerate;
    });

    adapter = new OllamaLLMAdapter();

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow('Empty response from Ollama');
  });

  it('should throw error when response JSON is invalid', async () => {
    const mockResponse = {
      response: 'invalid json',
    };

    const mockGenerate = vi.fn().mockResolvedValue(mockResponse);
    (Ollama as any).mockImplementation(function(this: any) {
      this.generate = mockGenerate;
    });

    adapter = new OllamaLLMAdapter();

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow();
  });

  it('should throw error when response schema is invalid', async () => {
    const mockResponse = {
      response: JSON.stringify({
        stringArrayId: 'not-a-number',
        stringFetcherId: 1,
        rotateId: null,
      }),
    };

    const mockGenerate = vi.fn().mockResolvedValue(mockResponse);
    (Ollama as any).mockImplementation(function(this: any) {
      this.generate = mockGenerate;
    });

    adapter = new OllamaLLMAdapter();

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow();
  });

  it('should use custom model from options', async () => {
    const mockResponse = {
      response: JSON.stringify({
        stringArrayId: null,
        stringFetcherId: null,
        rotateId: null,
      }),
    };

    const mockGenerate = vi.fn().mockResolvedValue(mockResponse);
    (Ollama as any).mockImplementation(function(this: any) {
      this.generate = mockGenerate;
    });

    adapter = new OllamaLLMAdapter();
    await adapter.detectPrelude(mockStatements, { model: 'llama3.1' });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'llama3.1',
      })
    );
  });

  it('should use custom host in constructor', () => {
    const customHost = 'http://custom-host:12345';
    const mockGenerate = vi.fn();
    (Ollama as any).mockImplementation(function(this: any, options: any) {
      this.generate = mockGenerate;
      this.host = options.host;
    });

    adapter = new OllamaLLMAdapter('llama3.2', customHost);

    // Check the last mock call (the one we just made)
    const lastCallIndex = (Ollama as any).mock.calls.length - 1;
    expect((Ollama as any).mock.calls[lastCallIndex][0]).toEqual({ host: customHost });
  });
});
