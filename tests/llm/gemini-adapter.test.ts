import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiLLMAdapter } from '../../src/llm/gemini-adapter.js';
import type { TaggedStatement } from '../../src/types.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

vi.mock('@google/generative-ai');

describe('GeminiLLMAdapter', () => {
  let adapter: GeminiLLMAdapter;
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
    adapter = new GeminiLLMAdapter('test-api-key', 'gemini-1.5-flash');
  });

  it('should initialize with correct name and default model', () => {
    expect(adapter.name).toBe('gemini');
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
      response: {
        text: () => JSON.stringify({
          stringArrayId: 0,
          stringFetcherId: 1,
          rotateId: null,
        }),
      },
    };

    const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
    const mockGetGenerativeModel = vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    });

    (GoogleGenerativeAI as any).mockImplementation(function(this: any) {
      this.getGenerativeModel = mockGetGenerativeModel;
    });

    adapter = new GeminiLLMAdapter('test-api-key');
    const result = await adapter.detectPrelude(mockStatements);

    expect(result.stringArrayId).toBe(0);
    expect(result.stringFetcherId).toBe(1);
    expect(result.rotateId).toBe(null);
    expect(result.raw).toEqual(mockResponse);

    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-1.5-flash' });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            parts: expect.any(Array),
          }),
        ]),
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      })
    );
  });

  it('should handle markdown-wrapped JSON response', async () => {
    const mockResponse = {
      response: {
        text: () => '```json\n{"stringArrayId": 2, "stringFetcherId": 3, "rotateId": 4}\n```',
      },
    };

    const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
    const mockGetGenerativeModel = vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    });

    (GoogleGenerativeAI as any).mockImplementation(function(this: any) {
      this.getGenerativeModel = mockGetGenerativeModel;
    });

    adapter = new GeminiLLMAdapter('test-api-key');
    const result = await adapter.detectPrelude(mockStatements);

    expect(result.stringArrayId).toBe(2);
    expect(result.stringFetcherId).toBe(3);
    expect(result.rotateId).toBe(4);
  });

  it('should throw error when response is empty', async () => {
    const mockResponse = {
      response: {
        text: () => '',
      },
    };

    const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
    const mockGetGenerativeModel = vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    });

    (GoogleGenerativeAI as any).mockImplementation(function(this: any) {
      this.getGenerativeModel = mockGetGenerativeModel;
    });

    adapter = new GeminiLLMAdapter('test-api-key');

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow('Empty response from Gemini');
  });

  it('should throw error when response JSON is invalid', async () => {
    const mockResponse = {
      response: {
        text: () => 'invalid json',
      },
    };

    const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
    const mockGetGenerativeModel = vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    });

    (GoogleGenerativeAI as any).mockImplementation(function(this: any) {
      this.getGenerativeModel = mockGetGenerativeModel;
    });

    adapter = new GeminiLLMAdapter('test-api-key');

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow();
  });

  it('should throw error when response schema is invalid', async () => {
    const mockResponse = {
      response: {
        text: () => JSON.stringify({
          stringArrayId: 'not-a-number',
          stringFetcherId: 1,
          rotateId: null,
        }),
      },
    };

    const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
    const mockGetGenerativeModel = vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    });

    (GoogleGenerativeAI as any).mockImplementation(function(this: any) {
      this.getGenerativeModel = mockGetGenerativeModel;
    });

    adapter = new GeminiLLMAdapter('test-api-key');

    await expect(adapter.detectPrelude(mockStatements)).rejects.toThrow();
  });

  it('should use custom model from options', async () => {
    const mockResponse = {
      response: {
        text: () => JSON.stringify({
          stringArrayId: null,
          stringFetcherId: null,
          rotateId: null,
        }),
      },
    };

    const mockGenerateContent = vi.fn().mockResolvedValue(mockResponse);
    const mockGetGenerativeModel = vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    });

    (GoogleGenerativeAI as any).mockImplementation(function(this: any) {
      this.getGenerativeModel = mockGetGenerativeModel;
    });

    adapter = new GeminiLLMAdapter('test-api-key');
    await adapter.detectPrelude(mockStatements, { model: 'gemini-1.5-pro' });

    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-1.5-pro' });
  });
});
