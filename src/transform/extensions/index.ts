/**
 * Extension Passes
 * 
 * These are additional deobfuscation passes for specific obfuscation techniques.
 * They are not enabled by default in the pipeline but can be explicitly enabled
 * when needed for specific obfuscated code patterns.
 */

export { booleanLiteralsPass } from './boolean-literals.js';
export { controlFlowFlatteningPass } from './control-flow-flattening.js';
export { deadCodeRemovalPass } from './dead-code-removal.js';
