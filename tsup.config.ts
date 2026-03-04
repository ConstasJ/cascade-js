import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  target: 'node18',
  external: ['openai', '@anthropic-ai/sdk', '@google/genai', 'ollama'],
  shims: true,
  clean: true,
  splitting: false,
});
