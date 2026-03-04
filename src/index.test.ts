import { describe, it, expect } from 'vitest';

describe('cascade-js', () => {
  it('should export successfully', async () => {
    const mod = await import('../dist/index.js');
    expect(mod).toBeDefined();
  });
});
