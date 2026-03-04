import { parseAndTag } from '../transform/splitter.js';
import { MockLLMAdapter } from '../llm/mock-adapter.js';
import { extractStringsFromPrelude } from '../sandbox/executor.js';
import type { PreludeDetectionResult, TaggedStatement, LLMAdapter } from '../types.js';

/**
 * Options for configuring the PreludeOrchestrator
 */
export interface PreludeOrchestratorOptions {
  /** LLM adapter to use for prelude detection */
  llmAdapter?: LLMAdapter;
  /** Timeout for operations in milliseconds */
  timeout?: number;
}

/**
 * Result of prelude detection and extraction
 */
export interface PreludeExtractionResult {
  /** Detection result from LLM */
  detection: PreludeDetectionResult;
  /** Extracted strings from the prelude */
  strings: Map<number, string>;
  /** Errors encountered during extraction */
  errors: string[];
}

/**
 * PreludeOrchestrator
 * 
 * Orchestrates the detection and extraction of obfuscated strings from the prelude section
 * of obfuscated JavaScript code. Uses LLM adapters for intelligent detection and sandbox
 * execution for safe string extraction.
 * 
 * The orchestrator:
 * 1. Splits code into tagged statements
 * 2. Uses LLM adapter to detect string array, fetcher, and rotate functions
 * 3. Executes the prelude in a sandbox to extract strings
 * 4. Returns extracted strings for use in string replacement pass
 */
export class PreludeOrchestrator {
  private options: Required<PreludeOrchestratorOptions>;
  
  constructor(options: PreludeOrchestratorOptions = {}) {
    this.options = {
      llmAdapter: options.llmAdapter || new MockLLMAdapter(),
      timeout: options.timeout ?? 5000,
    };
  }
  
  /**
   * Detect prelude and extract strings from obfuscated code
   * 
   * @param code - Obfuscated JavaScript code
   * @returns Detection result with extracted strings
   */
  async detectAndExtract(code: string): Promise<PreludeExtractionResult> {
    // Step 1: Split code into tagged statements
    const { statements } = parseAndTag(code);
    
    // Step 2: Detect prelude using LLM adapter
    const detection = await this.options.llmAdapter.detectPrelude(statements, {
      timeout: this.options.timeout,
    });
    
    // Initialize empty result
    const result: PreludeExtractionResult = {
      detection,
      strings: new Map(),
      errors: [],
    };
    
    // Step 3: If prelude detected, extract strings
    if (detection.stringArrayId !== null) {
      const stringArrayStmt = statements.find(s => s.id === detection.stringArrayId);
      
      if (stringArrayStmt) {
        // Extract the string array variable name (e.g., _0x1234)
        const match = stringArrayStmt.code.match(/var\s+(_0x\w+)\s*=/);
        
        if (match) {
          const arrayName = match[1];
          
          // Build prelude code (string array + rotate + fetcher)
          const preludeStatements = statements.filter(s => 
            s.id === detection.stringArrayId ||
            s.id === detection.stringFetcherId ||
            s.id === detection.rotateId
          );
          
          const preludeCode = preludeStatements.map(s => s.code).join('\n');
          
          // Execute in sandbox to get strings
          try {
            const sandboxResult = await extractStringsFromPrelude(
              preludeCode, 
              arrayName, 
              {
                timeout: this.options.timeout,
              }
            );
            
            result.strings = sandboxResult.strings;
            result.errors = sandboxResult.errors;
          } catch (err) {
            result.errors.push(
              err instanceof Error ? err.message : String(err)
            );
          }
        } else {
          result.errors.push('Could not extract string array variable name');
        }
      } else {
        result.errors.push(`String array statement ${detection.stringArrayId} not found`);
      }
    }
    
    return result;
  }
  
  /**
   * Detect only (without extraction) for quick prelude checking
   * 
   * @param code - JavaScript code to analyze
   * @returns Detection result
   */
  async detectOnly(code: string): Promise<PreludeDetectionResult> {
    const { statements } = parseAndTag(code);
    return this.options.llmAdapter.detectPrelude(statements, {
      timeout: this.options.timeout,
    });
  }
}
