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
export { definePass, type Pass, type PassConfig } from './pipeline/pass.js';

// All passes
export { stringReplacementPass } from './passes/string-replacement.js';
export { constantPropagationPass } from './passes/constant-propagation.js';
export { inliningPass } from './passes/inlining.js';
export { cleanupPass } from './passes/cleanup.js';

// Extension passes (optional, not enabled by default)
export { booleanLiteralsPass } from './transform/extensions/boolean-literals.js';
export { controlFlowFlatteningPass } from './transform/extensions/control-flow-flattening.js';
export { deadCodeRemovalPass } from './transform/extensions/dead-code-removal.js';
export { splitStringsPass } from './transform/extensions/split-strings.js';
export { unicodeEscapePass } from './transform/extensions/unicode-escape.js';
export { numbersToExpressionsPass } from './transform/extensions/numbers-to-expressions.js';
export { objectKeysPass } from './transform/extensions/object-keys.js';
export { selfDefendingPass } from './transform/extensions/self-defending.js';
export { debugProtectionPass } from './transform/extensions/debug-protection.js';
export { consoleOutputPass } from './transform/extensions/console-output.js';
export { domainLockPass } from './transform/extensions/domain-lock.js';
export { unminifyPass } from './transform/extensions/unminify.js';

// String array AST detection pass (pure pattern matching, no LLM)
export { stringArrayPass } from './passes/extensions/string-array.js';
export type { StringArrayDetection, DecoderDetection, RotateDetection, WrapperDetection } from './passes/extensions/string-array.js';

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