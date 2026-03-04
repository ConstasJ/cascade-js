# API Reference

Complete programmatic API reference for the cascade-js JavaScript deobfuscator.

## Quick Start

```typescript
import { deobfuscate } from 'cascade-js';

const obfuscated = `
  var _0x1234 = ['hello', 'world'];
  var a = _0x1234[0] + ' ' + _0x1234[1];
`;

const result = await deobfuscate(obfuscated);
console.log(result.code);  // Clean, readable JavaScript
console.log(result.warnings);  // Any warnings from the process
```

## Core API

### `deobfuscate(code, options?)`

The main entry point for deobfuscating JavaScript code.

```typescript
function deobfuscate(
  code: string,
  options?: DeobfuscateOptions
): Promise<CascadeResult>
```

#### Parameters

- **code** `string` - The obfuscated JavaScript source code to deobfuscate
- **options** `DeobfuscateOptions` (optional) - Configuration for the deobfuscation process

#### Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `llmAdapter` | `LLMAdapter` | `undefined` | LLM adapter for assisted passes. Pass `null` or `undefined` for pure AST mode |
| `timeout` | `number` | `60000` | Maximum time in milliseconds for deobfuscation |
| `customPasses` | `Pass[]` | `[]` | Additional passes to append to the default pipeline |
| `skipPrefilter` | `boolean` | `false` | Skip automatic obfuscation detection |

#### Returns

`Promise<CascadeResult>`

```typescript
interface CascadeResult {
  code: string;                    // The deobfuscated code
  warnings: string[];              // Non-fatal warnings
  stats?: {                        // Optional statistics
    passesRun: number;             // Number of passes executed
    timeMs: number;                // Total time in milliseconds
  };
}
```

#### Example

```typescript
import { deobfuscate, OpenAILLMAdapter } from 'cascade-js';

const adapter = new OpenAILLMAdapter(
  process.env.OPENAI_API_KEY,
  'gpt-4'
);

const result = await deobfuscate(code, {
  llmAdapter: adapter,
  timeout: 120000,
  skipPrefilter: false
});
```

## Pipeline API

### `createPipeline(config)`

Creates a configurable deobfuscation pipeline with fine-grained control over pass execution.

```typescript
function createPipeline(config: PipelineConfig): Pipeline
```

#### PipelineConfig

```typescript
interface PipelineConfig {
  options: CascadeOptions;   // Global options for the pipeline
  passes: Pass[];            // Array of passes to execute
}
```

#### Pipeline

```typescript
interface Pipeline {
  run(code: string): Promise<CascadeResult>;
}
```

The pipeline uses Kahn's algorithm for topological sorting. Passes are automatically ordered based on their declared dependencies before execution begins. This ensures that each pass runs only after all its dependencies have completed.

#### Example

```typescript
import { createPipeline, stringArrayPass, controlFlowFlatteningPass } from 'cascade-js';

// Create a minimal pipeline with just two passes
const pipeline = createPipeline({
  options: { timeout: 30000 },
  passes: [
    stringArrayPass,
    controlFlowFlatteningPass
  ]
});

const result = await pipeline.run(obfuscatedCode);
console.log(result.code);
```

## Pass System

### `definePass(config)`

Factory function for creating custom deobfuscation passes.

```typescript
function definePass(config: PassConfig): Pass
```

#### PassConfig

```typescript
interface PassConfig {
  name: string;                                            // Unique identifier
  dependencies?: string[];                                 // Names of passes that must run first
  transform: (code: string, context: PipelineContext) => Promise<string>;
}
```

#### Pass

```typescript
interface Pass {
  name: string;
  dependencies: string[];
  transform: (code: string, context: PipelineContext) => Promise<string>;
}
```

#### PipelineContext

```typescript
interface PipelineContext {
  llm: LLMAdapter;                   // The configured LLM adapter
  shared: Record<string, any>;       // Shared state between passes
}
```

The `shared` object includes:
- `shared.passesApplied` `string[]` - Array tracking which passes have already been applied

#### Example: Custom Pass

```typescript
import { definePass, deobfuscate } from 'cascade-js';

// Define a custom pass that removes a specific pattern
const myCustomPass = definePass({
  name: 'customPatternRemoval',
  dependencies: ['stringArray'],  // Run after stringArrayPass
  transform: async (code, context) => {
    // Access the LLM adapter if needed
    if (context.llm) {
      // Use LLM for complex analysis
    }
    
    // Simple regex-based transformation
    return code.replace(/customObfuscation\([^)]*\)/g, '/* removed */');
  }
});

// Use the custom pass
const result = await deobfuscate(code, {
  customPasses: [myCustomPass]
});
```

## Built-in Passes

All 15 built-in passes, listed in their default execution order:

| Import | Pass Name | Dependencies | Description |
|--------|-----------|--------------|-------------|
| `stringArrayPass` | `stringArray` | `[]` | Detects and extracts string arrays using AST analysis. Identifies common obfuscation patterns where strings are stored in arrays and accessed by index. |
| `selfDefendingPass` | `selfDefending` | `[]` | Removes self-defending code that detects tampering or modification attempts. |
| `debugProtectionPass` | `debugProtection` | `[]` | Strips debug protection mechanisms that trigger when DevTools is opened. |
| `consoleOutputPass` | `consoleOutput` | `[]` | Removes code that disables or redirects console output. |
| `domainLockPass` | `domainLock` | `[]` | Removes domain lock checks that restrict code execution to specific domains. |
| `deadCodeRemovalPass` | `deadCodeRemoval` | `[]` | Identifies and removes injected dead code blocks that serve no functional purpose. |
| `controlFlowFlatteningPass` | `controlFlowFlattening` | `[]` | Reverses control flow flattening. Handles switch-based flattening and object-based state machines to restore natural control flow. |
| `objectKeysPass` | `objectKeys` | `[]` | Reverses object key transformations. Restores original property names from obfuscated versions. |
| `splitStringsPass` | `splitStrings` | `[]` | Joins strings that were split across multiple concatenations back together. |
| `unicodeEscapePass` | `unicodeEscape` | `[]` | Normalizes Unicode and hexadecimal escape sequences to readable characters. |
| `numbersToExpressionsPass` | `numbersToExpressions` | `[]` | Folds numeric expressions back to their constant values through constant folding. |
| `stringReplacementPass` | `stringReplacement` | `['stringArray']` | LLM-assisted pass for intelligent string literal analysis and replacement. Requires LLM adapter. |
| `constantPropagationPass` | `constantPropagation` | `[]` | Propagates constant values through the code to simplify expressions. |
| `booleanLiteralsPass` | `booleanLiterals` | `[]` | Normalizes boolean literal expressions (e.g., `!![]` becomes `true`). |
| `unminifyPass` | `unminify` | `[]` | Restores code readability with 16 sub-transforms including variable renaming, brace style normalization, and statement restructuring. |

### Usage Example

```typescript
import {
  deobfuscate,
  stringArrayPass,
  controlFlowFlatteningPass,
  unminifyPass
} from 'cascade-js';

// Use specific passes in a custom pipeline
import { createPipeline } from 'cascade-js';

const minimalPipeline = createPipeline({
  options: {},
  passes: [stringArrayPass, controlFlowFlatteningPass, unminifyPass]
});
```

## LLM Adapters

LLM adapters enable intelligent deobfuscation features. All adapters implement the `LLMAdapter` interface.

### LLMAdapter Interface

```typescript
interface LLMAdapter {
  name: string;
  detectPrelude(
    statements: TaggedStatement[],
    options?: LLMOptions
  ): Promise<PreludeDetectionResult>;
}
```

### Built-in Adapters

#### OpenAILLMAdapter

```typescript
import { OpenAILLMAdapter } from 'cascade-js';

const adapter = new OpenAILLMAdapter(
  apiKey,              // Required: OpenAI API key
  'gpt-4o-mini',       // Optional: Model name (default: 'gpt-4o-mini')
  'https://custom.api' // Optional: Custom API endpoint
);
```

#### AnthropicLLMAdapter

```typescript
import { AnthropicLLMAdapter } from 'cascade-js';

const adapter = new AnthropicLLMAdapter(
  apiKey,                         // Required: Anthropic API key
  'claude-3-haiku-20240307',      // Optional: Model name (default: 'claude-3-haiku-20240307')
  'https://custom.api'            // Optional: Custom API endpoint
);
```

#### GeminiLLMAdapter

```typescript
import { GeminiLLMAdapter } from 'cascade-js';

const adapter = new GeminiLLMAdapter(
  apiKey,                // Required: Google API key
  'gemini-1.5-flash',   // Optional: Model name (default: 'gemini-1.5-flash')
);
```

#### OllamaLLMAdapter

```typescript
import { OllamaLLMAdapter } from 'cascade-js';

const adapter = new OllamaLLMAdapter(
  'llama3.2',                    // Optional: Model name (default: 'llama3.2')
  'http://localhost:11434'       // Optional: Ollama server URL (default: 'http://localhost:11434')
);
```

#### MockLLMAdapter

```typescript
import { MockLLMAdapter } from 'cascade-js';

const adapter = new MockLLMAdapter();
// Returns mock responses for testing without API calls
```

### Example: Using LLM Adapter

```typescript
import { deobfuscate, AnthropicLLMAdapter } from 'cascade-js';

const llm = new AnthropicLLMAdapter(
  process.env.ANTHROPIC_API_KEY,
  'claude-3-sonnet-20240229'
);

const result = await deobfuscate(obfuscatedCode, {
  llmAdapter: llm,
  timeout: 90000
});

console.log(result.code);
console.log(result.stats?.passesRun);
```

## Sandbox API

### `executeInSandbox(code, options?)`

Safely executes JavaScript code using QuickJS WASM. Useful for extracting runtime values without security risks.

```typescript
function executeInSandbox(
  code: string,
  options?: SandboxOptions
): ExecutionResult
```

#### Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `timeout` | `number` | `5000` | Execution timeout in milliseconds |
| `memoryLimit` | `number` | `64` | Memory limit in megabytes |

#### Returns

```typescript
interface ExecutionResult {
  success: boolean;
  result?: any;              // Return value if execution succeeded
  error?: string;            // Error message if execution failed
}
```

#### Example

```typescript
import { executeInSandbox } from 'cascade-js';

const code = `
  var secret = atob('SGVsbG8gV29ybGQ=');
  console.log('Decrypted:', secret);
  secret;
`;

const execution = executeInSandbox(code, {
  timeout: 10000,
  memoryLimit: 128
});

if (execution.success) {
  console.log('Result:', execution.result);  // "Hello World"
  console.log('Logs:', execution.logs);      // ["Decrypted: Hello World"]
}
```

## Prefilter API

### `detectObfuscation(code)`

Analyzes code to determine if it appears obfuscated.

```typescript
function detectObfuscation(code: string): DetectionResult
```

#### Returns

```typescript
interface DetectionResult {
  detected: boolean;         // True if obfuscation patterns found
  confidence: number;        // Confidence score from 0 to 1
  patterns: string[];        // List of detected obfuscation patterns
}
```

#### Detected Patterns

Common patterns that may be detected:
- `stringArray` - Array-based string obfuscation
- `hexIdentifiers` - Hexadecimal-style variable names
- `rotateIIFE` - String array rotation IIFEs
- `stringFetcher` - String fetcher function patterns

#### Example

```typescript
import { detectObfuscation } from 'cascade-js';

const analysis = detectObfuscation(suspiciousCode);

if (analysis.detected) {
  console.log(`Obfuscation detected with ${(analysis.confidence * 100).toFixed(1)}% confidence`);
  console.log('Patterns:', analysis.patterns.join(', '));
  
  // Proceed with deobfuscation
  const result = await deobfuscate(suspiciousCode);
}
```

## TypeScript Types

All types are exported from the main package entry point.

### Core Types

```typescript
// Main result type
interface CascadeResult {
  code: string;
  warnings: string[];
  stats?: {
    passesRun: number;
    timeMs: number;
  };
}

// Options for deobfuscate()
interface DeobfuscateOptions {
  llmAdapter?: LLMAdapter | null;
  timeout?: number;
  customPasses?: Pass[];
  skipPrefilter?: boolean;
}

// Global cascade options
interface CascadeOptions {
  timeout?: number;
  [key: string]: any;
}
```

### Pipeline Types

```typescript
// Pipeline configuration
interface PipelineConfig {
  options: CascadeOptions;
  passes: Pass[];
}

// Pipeline instance
interface Pipeline {
  run(code: string): Promise<CascadeResult>;
}

// Pass definition configuration
interface PassConfig {
  name: string;
  dependencies?: string[];
  transform: (code: string, context: PipelineContext) => Promise<string>;
}

// Pass instance
interface Pass {
  name: string;
  dependencies: string[];
  transform: (code: string, context: PipelineContext) => Promise<string>;
}

// Context passed to each pass
interface PipelineContext {
  llm: LLMAdapter;
  shared: Record<string, any>;
}
```

### LLM Types

```typescript
// LLM adapter interface
interface LLMAdapter {
  name: string;
  detectPrelude(
    statements: string[],
    options?: DetectPreludeOptions
  ): Promise<PreludeDetectionResult>;
}

// Options for prelude detection
interface DetectPreludeOptions {
  maxStatements?: number;
  timeout?: number;
}

// Result from prelude detection
interface PreludeDetectionResult {
  isPrelude: boolean;
  confidence: number;
  description?: string;
}

// Adapter constructor options
interface OpenAIAdapterOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

interface AnthropicAdapterOptions {
  apiKey: string;
  model?: string;
}

interface GeminiAdapterOptions {
  apiKey: string;
  model?: string;
}

interface OllamaAdapterOptions {
  model?: string;
  baseUrl?: string;
}
```

### Sandbox Types

```typescript
// Sandbox execution options
interface SandboxOptions {
  timeout?: number;
  memoryLimit?: number;
}

// Sandbox execution result
interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  logs?: string[];
}
```

### Prefilter Types

```typescript
// Obfuscation detection result
interface DetectionResult {
  detected: boolean;
  confidence: number;
  patterns: string[];
}
```

## Module Exports

All public APIs can be imported from the main package:

```typescript
// Core API
import { deobfuscate, createPipeline, definePass } from 'cascade-js';

// Passes
import {
  stringArrayPass,
  selfDefendingPass,
  debugProtectionPass,
  consoleOutputPass,
  domainLockPass,
  deadCodeRemovalPass,
  controlFlowFlatteningPass,
  objectKeysPass,
  splitStringsPass,
  unicodeEscapePass,
  numbersToExpressionsPass,
  stringReplacementPass,
  constantPropagationPass,
  booleanLiteralsPass,
  unminifyPass
} from 'cascade-js';

// LLM Adapters
import {
  OpenAILLMAdapter,
  AnthropicLLMAdapter,
  GeminiLLMAdapter,
  OllamaLLMAdapter,
  MockLLMAdapter
} from 'cascade-js';

// Utilities
import { executeInSandbox, detectObfuscation } from 'cascade-js';

// Types
import type {
  CascadeResult,
  DeobfuscateOptions,
  Pipeline,
  PipelineConfig,
  Pass,
  PassConfig,
  LLMAdapter,
  ExecutionResult,
  DetectionResult
} from 'cascade-js';
```

Both ESM and CommonJS are supported:

```javascript
// CommonJS
const { deobfuscate, OpenAILLMAdapter } = require('cascade-js');
```
