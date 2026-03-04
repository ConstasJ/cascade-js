/**
 * Pass interface and helper functions for CASCADE pipeline
 */

import type { PipelineContext } from './pipeline.js';

/**
 * A transformation pass in the deobfuscation pipeline
 */
export interface Pass {
  /** Unique name for this pass */
  name: string;

  /** Names of passes this pass depends on (must run before this one) */
  dependencies: string[];

  /** Transform function that modifies the code */
  transform: (code: string, context: PipelineContext) => Promise<string>;
}

/**
 * Configuration for defining a pass
 */
export interface PassConfig {
  /** Unique name for this pass */
  name: string;

  /** Names of passes this pass depends on (optional) */
  dependencies?: string[];

  /** Transform function that modifies the code */
  transform: Pass['transform'];
}

/**
 * Helper function to define a pass with better defaults
 */
export function definePass(config: PassConfig): Pass {
  return {
    name: config.name,
    dependencies: config.dependencies ?? [],
    transform: config.transform,
  };
}
