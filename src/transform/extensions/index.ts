/**
 * Extension Passes
 * 
 * These are additional deobfuscation passes for specific obfuscation techniques.
 * They are not enabled by default in the pipeline but can be explicitly enabled
 * when needed for specific obfuscated code patterns.
 */

// Core transforms
export { booleanLiteralsPass } from './boolean-literals.js';
export { controlFlowFlatteningPass } from './control-flow-flattening.js';
export { deadCodeRemovalPass } from './dead-code-removal.js';

// String transforms
export { splitStringsPass } from './split-strings.js';
export { unicodeEscapePass } from './unicode-escape.js';

// Number/Expression transforms
export { numbersToExpressionsPass } from './numbers-to-expressions.js';
export { objectKeysPass } from './object-keys.js';

// Protection removal
export { selfDefendingPass } from './self-defending.js';
export { debugProtectionPass } from './debug-protection.js';
export { consoleOutputPass } from './console-output.js';
export { domainLockPass } from './domain-lock.js';

// Unminify
export { unminifyPass } from './unminify.js';
