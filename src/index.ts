/**
 * CASCADE - Contextual AST-based Code Approach to Semantically Deobfuscate JavaScript
 * Main public API
 */

// Main deobfuscate function and pipeline utilities
export {
  deobfuscate,
  createPipeline,
  type DeobfuscateOptions,
  type Pipeline,
  type PipelineConfig,
  type PipelineContext,
  type CascadeOptions,
  type CascadeResult,
  type DeobfuscationStats,
} from './pipeline/pipeline.js';

// Pass types
export { type Pass } from './pipeline/pass.js';

// All passes
export { stringReplacementPass } from './passes/string-replacement.js';
export { constantPropagationPass } from './passes/constant-propagation.js';
export { inliningPass } from './passes/inlining.js';
export { cleanupPass } from './passes/cleanup.js';

// LLM adapters
export {
  type LLMAdapter,
  type LLMOptions,
} from './types.js';
export { MockLLMAdapter } from './llm/mock-adapter.js';
export { OpenAILLMAdapter } from './llm/openai-adapter.js';
export { AnthropicLLMAdapter } from './llm/anthropic-adapter.js';
export { GeminiLLMAdapter } from './llm/gemini-adapter.js';
export { OllamaLLMAdapter } from './llm/ollama-adapter.js';

// Prelude orchestrator
export {
  PreludeOrchestrator,
  type PreludeOrchestratorOptions,
  type PreludeExtractionResult,
} from './prelude/orchestrator.js';

// Obfuscation detector
export {
  detectObfuscation,
  type DetectionResult,
} from './prefilter/detector.js';

// Statement splitter
export {
  parseAndTag,
  countStatements,
  type SplitResult,
} from './transform/splitter.js';

// Sandbox utilities
export {
  executeInSandbox,
  extractStringsFromPrelude,
  type ExecutionResult,
} from './sandbox/executor.js';

// Common types
export type {
  TaggedStatement,
  PreludeDetectionResult,
  PreludeTemplate,
  AbstractValue,
  SandboxResult,
  SandboxOptions,
} from './types.js';