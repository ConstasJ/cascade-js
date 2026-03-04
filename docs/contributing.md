# Contributing Guide

Thank you for your interest in contributing to cascade-js. This guide covers development setup, project architecture, and how to add new passes.

## Prerequisites

- **Node.js** >= 18 (ES2022 features required)
- **pnpm** 10.28.0 (specified in packageManager field)

```bash
node --version  # Verify Node.js version
npm install -g pnpm@10.28.0  # Install pnpm
```

## Getting Started

```bash
git clone <repository-url>
cd cascade-js
pnpm install
pnpm test      # Verify setup
pnpm build     # Build project
```

## Project Structure

```
src/
  cli.ts              # CLI entry point (commander.js)
  index.ts            # Public API exports
  types.ts            # Core TypeScript types + Zod schemas
  llm/                # LLM adapter implementations
    adapter.ts        # LLMAdapter interface + BaseLLMAdapter
    openai-adapter.ts
    anthropic-adapter.ts
    gemini-adapter.ts
    ollama-adapter.ts
    mock-adapter.ts
  passes/             # High-level deobfuscation passes
    string-replacement.ts
    constant-propagation.ts
    inlining.ts
    cleanup.ts
    extensions/
      string-array.ts  # Pure-AST string array detection
  pipeline/           # Pipeline orchestration
    pass.ts           # definePass() factory
    pipeline.ts       # createPipeline(), deobfuscate()
  prefilter/          # Obfuscation detection
    detector.ts       # detectObfuscation()
  prelude/            # LLM-assisted prelude detection
    orchestrator.ts   # PreludeOrchestrator
  sandbox/            # Safe code execution
    executor.ts       # QuickJS WASM sandbox
  transform/          # AST-based transforms
    extensions/
      boolean-literals.ts
      control-flow-flattening.ts
      dead-code-removal.ts
      split-strings.ts
      unicode-escape.ts
      numbers-to-expressions.ts
      object-keys.ts
      self-defending.ts
      debug-protection.ts
      console-output.ts
      domain-lock.ts
      unminify.ts
      index.ts        # Extension barrel exports
tests/
  transform/extensions/index.test.ts  # Transform extension tests
  passes/extensions/string-array.test.ts  # String array tests
  ...
```

## Architecture Overview

**Dual Pass Systems:**

1. **String-based passes** - Created with `definePass()` from `src/pipeline/pass.ts`. Operate on JavaScript source strings for higher-level transformations.

2. **AST-based transforms** - Located in `src/transform/extensions/`. Operate on Babel AST nodes for fine-grained manipulation.

**Pipeline Orchestration:** Uses topological sort (Kahn's algorithm) for pass ordering based on declared dependencies.

**Security:** QuickJS-emscripten sandbox isolates execution of untrusted rotation functions.

**LLM Integration:** Optional fallback for complex prelude detection. Many passes work via pure AST analysis without API calls.

**Prefilter:** Quick heuristic detection runs before processing to identify obfuscation patterns.

## Writing a New Pass

Use `definePass()` from `src/pipeline/pass.js` or create an AST transform. Pattern: parse → traverse → transform → generate.

**CRITICAL Babel Import Pattern (ESM/CJS Interop Required):**

```typescript
import traverseDefault from '@babel/traverse';
import generateDefault from '@babel/generator';
const traverse = typeof traverseDefault === 'function'
  ? traverseDefault
  : (traverseDefault as any).default;
const generate = typeof generateDefault === 'function'
  ? generateDefault
  : (generateDefault as any).default;
```

**Visitor handler parameters must be typed as `any`.**

**Always push pass name to `context.shared.passesApplied` when changes occur.**

**Parse with `sourceType: 'script'` or `'unambiguous'`.**

### Complete Minimal Pass Example

import { parse } from '@babel/parser';
import traverseDefault from '@babel/traverse';
import generateDefault from '@babel/generator';
import * as t from '@babel/types';
import { definePass } from '../pipeline/pass.js';

const traverse = typeof traverseDefault === 'function'
  ? traverseDefault
  : (traverseDefault as any).default;
const generate = typeof generateDefault === 'function'
  ? generateDefault
  : (generateDefault as any).default;

export const removeConsoleLogPass = definePass({
  name: 'removeConsoleLog',
  dependencies: [],

  async transform(code: string, context) {
    const ast = parse(code, {
      sourceType: 'unambiguous',
    });

    let modified = false;

    traverse(ast, {
      CallExpression(path: any) {
        const { node } = path;
        if (
          t.isMemberExpression(node.callee) &&
          t.isIdentifier(node.callee.object, { name: 'console' }) &&
          t.isIdentifier(node.callee.property, { name: 'log' })
        ) {
          path.remove();
          modified = true;
        }
      }
    });

    if (modified) {
      if (!context.shared.passesApplied) context.shared.passesApplied = [];
      context.shared.passesApplied.push('removeConsoleLog');
    }

    const output = generate(ast, { retainLines: false });
    return output.code;
  }
});
```

## Registering a Pass

1. **Export from Extension Index:**
   ```typescript
   // src/transform/extensions/index.ts
   export { removeConsoleLog } from './remove-console-log.js';
   ```

2. **Add to Pipeline Defaults:**
   ```typescript
   // src/pipeline/pipeline.ts
   import { removeConsoleLog } from '../transform/extensions/index.js';
   
   export const defaultPasses = [
     // ... existing passes
     removeConsoleLog,
     cleanup
   ];
   ```

3. **Re-export from Main Index (if public):**
   ```typescript
   // src/index.ts
   export { removeConsoleLog } from './transform/extensions/index.js';
   ```

**Pipeline Ordering:** Declare dependencies correctly. Passes list later passes as dependencies if those build upon their work:

```typescript
export const stringArray: TransformExtension = {
  name: 'string-array',
  dependencies: [],  // Runs first
  // ...
};

export const stringReplacement: TransformExtension = {
  name: 'string-replacement',
  dependencies: ['string-array'],  // Runs after
  // ...
};
```

## Testing

Framework: **vitest**

```bash
pnpm test                    # Run all tests
npx vitest run               # Alternative
npx vitest run tests/path    # Specific test
pnpm test:watch              # Watch mode
```

### Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { removeConsoleLogPass } from '../../../src/transform/extensions/remove-console-log.js';

describe('removeConsoleLog', () => {
  it('should remove console.log calls', async () => {
    const input = 'console.log("hello"); var x = 1;';
    const context = { llm: {} as any, shared: { passesApplied: [] } };
    
    const result = await removeConsoleLogPass.transform(input, context);
    
    expect(result.trim()).toBe('var x = 1;');
  });

  it('should not modify code without console.log', async () => {
    const input = 'var x = 1;';
    const context = { llm: {} as any, shared: { passesApplied: [] } };
    
    const result = await removeConsoleLogPass.transform(input, context);
    
    expect(result.trim()).toBe(input);
  });
});
```

## Code Quality

- TypeScript strict mode required
- `pnpm lint` - Run ESLint
- `pnpm check` - Full check (tsc + eslint + vitest)

**Rules:**
- NEVER use `as any` except for Babel interop pattern above
- NEVER use `@ts-ignore` or `@ts-expect-error`

## Commit Convention

Follow **Conventional Commits**:

```
<type>(<scope>): <description>

[optional body]
```

**Types:** feat, fix, test, docs, chore, refactor

**Scopes:** transforms, passes, pipeline, cli, llm, sandbox

**Examples:**

```bash
fix(transforms): handle unicode escapes in string literals
feat(passes): add support for rotated string arrays
feat(cli): add --timeout option
```

## Known Gotchas

### Babel Traverse Exit Syntax

Babel traverse 7.29.0 does NOT support `'IfStatement:exit'` syntax. Use nested pattern:

```typescript
// WRONG
traverse(ast, {
  'IfStatement:exit'(path: any) { }
});

// CORRECT
traverse(ast, {
  IfStatement: {
    exit(path: any) { }
  }
});
```

### Babel Import ESM/CJS Interop

The interop pattern is REQUIRED. Always use:

```typescript
import traverseDefault from '@babel/traverse';
const traverse = typeof traverseDefault === 'function'
  ? traverseDefault
  : (traverseDefault as any).default;
```

### Visitor Handler Parameter Types

Always type as `any`:

```typescript
traverse(ast, {
  CallExpression(path: any) { }
});
```

### Parse Source Type

```typescript
const ast = parse(code, {
  sourceType: 'unambiguous',  // or 'script'
  plugins: ['jsx']
});
```

---

For questions, check existing passes in `src/transform/extensions/` for reference implementations.
