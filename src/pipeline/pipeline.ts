/**
 * Pipeline orchestrator for CASCADE deobfuscation
 */

import type { Pass } from './pass.js';
import type { LLMAdapter } from '../types.js';
import { detectObfuscation } from '../prefilter/detector.js';
import { PreludeOrchestrator } from '../prelude/orchestrator.js';
import { stringReplacementPass } from '../passes/string-replacement.js';
import { constantPropagationPass } from '../passes/constant-propagation.js';

/**
 * Context shared across all passes in a pipeline execution
 */
export interface PipelineContext {
  /** Shared data that passes can read/write */
  shared: Record<string, any>;
}

/**
 * Options for CASCADE pipeline execution
 */
export interface CascadeOptions {
  /** Global timeout in milliseconds for entire pipeline */
  timeout: number;
}

/**
 * Result of running the pipeline
 */
export interface CascadeResult {
  /** Transformed code */
  code: string;

  /** Warnings collected during execution */
  warnings: string[];

  /** Statistics about the deobfuscation */
  stats?: DeobfuscationStats;
}

/**
 * Statistics about deobfuscation process
 */
export interface DeobfuscationStats {
  /** Number of passes executed */
  passesRun: number;

  /** Time taken in milliseconds */
  timeMs: number;
}

/**
 * Pipeline interface
 */
export interface Pipeline {
  run(code: string): Promise<CascadeResult>;
}

/**
 * Configuration for creating a pipeline
 */
export interface PipelineConfig {
  options: CascadeOptions;
  passes: Pass[];
}

/**
 * Creates a CASCADE pipeline with the given configuration
 */
export function createPipeline(config: PipelineConfig): Pipeline {
  return {
    async run(code: string): Promise<CascadeResult> {
      const startTime = Date.now();
      const warnings: string[] = [];
      let currentCode = code;

      // Create shared context
      const context: PipelineContext = {
        shared: {},
      };

      // Sort passes in dependency order
      const sortedPasses = topologicalSort(config.passes);

      // Run with timeout
      const timeoutPromise = new Promise<CascadeResult>((resolve) => {
        setTimeout(() => {
          resolve({
            code,
            warnings: ['Pipeline execution timeout exceeded'],
            stats: {
              passesRun: 0,
              timeMs: config.options.timeout,
            },
          });
        }, config.options.timeout);
      });

      const executionPromise = (async (): Promise<CascadeResult> => {
        let passesRun = 0;

        for (const pass of sortedPasses) {
          try {
            currentCode = await pass.transform(currentCode, context);
            passesRun++;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            warnings.push(
              `Pass '${pass.name}' failed: ${errorMessage}`
            );
          }
        }

        const endTime = Date.now();
        return {
          code: currentCode,
          warnings,
          stats: {
            passesRun,
            timeMs: endTime - startTime,
          },
        };
      })();

      // Race between timeout and execution
      return Promise.race([timeoutPromise, executionPromise]);
    },
  };
}

/**
 * Topologically sort passes based on their dependencies using Kahn's algorithm
 * @param passes Array of passes to sort
 * @returns Passes in dependency-resolved order
 * @throws Error if circular dependency detected
 */
function topologicalSort(passes: Pass[]): Pass[] {
  // Handle empty array
  if (passes.length === 0) {
    return [];
  }

  // Build adjacency list and in-degree map
  const passMap = new Map<string, Pass>();
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  // Initialize maps
  for (const pass of passes) {
    passMap.set(pass.name, pass);
    inDegree.set(pass.name, 0);
    adjList.set(pass.name, []);
  }

  // Build graph
  for (const pass of passes) {
    for (const dep of pass.dependencies) {
      if (!passMap.has(dep)) {
        throw new Error(
          `Pass '${pass.name}' depends on '${dep}', but '${dep}' is not in the pipeline`
        );
      }

      // dep -> pass (dependency must come before)
      adjList.get(dep)!.push(pass.name);
      inDegree.set(pass.name, inDegree.get(pass.name)! + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  const result: Pass[] = [];

  // Add all nodes with in-degree 0 to queue
  for (const [name, degree] of Array.from(inDegree.entries())) {
    if (degree === 0) {
      queue.push(name);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(passMap.get(current)!);

    // Reduce in-degree of neighbors
    for (const neighbor of adjList.get(current)!) {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);

      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycle
  if (result.length !== passes.length) {
    throw new Error('Circular dependency detected in passes');
  }

  return result;
}

// Re-export types needed by pass.ts
export type { Pass };

/**
 * Options for deobfuscate convenience function
 */
export interface DeobfuscateOptions {
  /** LLM adapter to use for prelude detection */
  llmAdapter?: LLMAdapter;
  /** Global timeout in milliseconds for entire pipeline (default: 60000) */
  timeout?: number;
  /** Custom passes to use instead of default passes */
  customPasses?: Pass[];
  /** Skip prefilter detection (force deobfuscation) */
  skipPrefilter?: boolean;
}

/**
 * Convenience function that wires all components together for full CASCADE deobfuscation
 * 
 * @param code - Obfuscated JavaScript code
 * @param options - Configuration options
 * @returns Deobfuscated code with metadata
 */
export async function deobfuscate(
  code: string,
  options: DeobfuscateOptions = {}
): Promise<CascadeResult> {
  const timeout = options.timeout ?? 60000;
  const warnings: string[] = [];

  // Step 1: Pre-filter detection (skip if requested)
  if (!options.skipPrefilter) {
    const detection = detectObfuscation(code);
    if (!detection.detected) {
      warnings.push(
        `Low obfuscation confidence (${(detection.confidence * 100).toFixed(1)}%). Code may not be obfuscated.`
      );
    }
  }

  // Step 2: Prelude detection and string extraction
  const orchestratorOptions = options.llmAdapter 
    ? { llmAdapter: options.llmAdapter, timeout: Math.floor(timeout * 0.2) }
    : { timeout: Math.floor(timeout * 0.2) };
  
  const orchestrator = new PreludeOrchestrator(orchestratorOptions);

  const preludeResult = await orchestrator.detectAndExtract(code);
  warnings.push(...preludeResult.errors);

  // Step 3: Build pipeline with default or custom passes
  // Note: Only use string-based passes (not AST passes like cleanup/inlining)
  const passes: Pass[] = options.customPasses ?? [
    stringReplacementPass,
    constantPropagationPass,
  ];

  // Create a modified pipeline that injects the recovered strings into context
  const pipeline: Pipeline = {
    async run(inputCode: string): Promise<CascadeResult> {
      const startTime = Date.now();
      const pipelineWarnings: string[] = [];
      let currentCode = inputCode;

      // Create shared context with recovered strings
      const context: PipelineContext = {
        shared: {
          recoveredStrings: preludeResult.strings,
        },
      };

      // Sort passes in dependency order
      const sortedPasses = topologicalSort(passes);

      // Run with timeout
      const timeoutPromise = new Promise<CascadeResult>((resolve) => {
        setTimeout(() => {
          resolve({
            code: inputCode,
            warnings: ['Pipeline execution timeout exceeded'],
            stats: {
              passesRun: 0,
              timeMs: timeout,
            },
          });
        }, Math.floor(timeout * 0.8));
      });

      const executionPromise = (async (): Promise<CascadeResult> => {
        let passesRun = 0;

        for (const pass of sortedPasses) {
          try {
            currentCode = await pass.transform(currentCode, context);
            passesRun++;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            pipelineWarnings.push(
              `Pass '${pass.name}' failed: ${errorMessage}`
            );
          }
        }

        const endTime = Date.now();
        return {
          code: currentCode,
          warnings: pipelineWarnings,
          stats: {
            passesRun,
            timeMs: endTime - startTime,
          },
        };
      })();

      // Race between timeout and execution
      return Promise.race([timeoutPromise, executionPromise]);
    },
  };

  // Step 4: Run pipeline
  const result = await pipeline.run(code);

  // Merge warnings
  return {
    ...result,
    warnings: [...warnings, ...result.warnings],
  };
}
