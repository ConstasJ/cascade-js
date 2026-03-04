#!/usr/bin/env node
/**
 * CASCADE CLI - Command-line interface for the deobfuscator
 */

import fs from 'fs';
import { stdin as stdInput } from 'process';
import { Command } from 'commander';
import { deobfuscate } from './pipeline/pipeline.js';
import {
  OpenAILLMAdapter,
  AnthropicLLMAdapter,
  GeminiLLMAdapter,
  OllamaLLMAdapter,
} from './index.js';
import type { DeobfuscateOptions } from './pipeline/pipeline.js';
import type { LLMAdapter } from './types.js';

const VERSION = '1.0.0';

interface CLIOptions {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeout: string;
  verbose: boolean;
  quiet: boolean;
  noPrefilter: boolean;
  json: boolean;
}

/**
 * Create an LLM adapter based on provider and model
 */
function createAdapter(provider: string, model: string, apiKey: string, baseURL?: string): LLMAdapter {
  switch (provider.toLowerCase()) {
    case 'openai':
      return new OpenAILLMAdapter(apiKey, model, baseURL);
    case 'anthropic':
      return new AnthropicLLMAdapter(apiKey, model, baseURL);
    case 'gemini':
      return new GeminiLLMAdapter(apiKey, model, baseURL);
    case 'ollama':
      return new OllamaLLMAdapter(model, baseURL);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Read input from file or stdin
 */
async function readInput(inputPath: string | undefined): Promise<string> {
  if (!inputPath || inputPath === '-') {
    // Read from stdin
    return new Promise((resolve, reject) => {
      let data = '';
      stdInput.setEncoding('utf8');
      stdInput.on('data', chunk => {
        data += String(chunk);
      });
      stdInput.on('end', () => {
        resolve(data);
      });
      stdInput.on('error', reject);
    });
  }

  // Read from file
  try {
    return fs.readFileSync(inputPath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to read input file: ${inputPath} - ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Write output to file or stdout
 */
function writeOutput(output: string, outputPath: string | undefined): void {
  if (!outputPath) {
    // Write to stdout
    process.stdout.write(output);
    return;
  }

  try {
    fs.writeFileSync(outputPath, output, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to write output file: ${outputPath} - ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Pretty-print statistics to stderr
 */
function printStats(
  stats: any,
  verbose: boolean,
  json: boolean
): void {
  if (json) {
    return; // JSON output handled separately
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('━━━ CASCADE Deobfuscation Statistics ━━━');
  lines.push(`Recovered Literals: ${stats.recoveredLiterals || 0}`);
  lines.push(`Prelude Detected: ${stats.preludeDetected ? 'Yes' : 'No'}`);
  lines.push(`Passes Applied: ${(stats.passesApplied || []).join(', ') || 'None'}`);

  if (verbose && stats.timingMs) {
    lines.push('');
    lines.push('Timing Breakdown:');
    const timings = Object.entries(stats.timingMs as Record<string, number>);
    for (const [key, value] of timings) {
      lines.push(`  ${key}: ${value.toFixed(2)}ms`);
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  process.stderr.write(lines.join('\n'));
}

/**
 * Main CLI function
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('cascade-js')
    .description('CASCADE - Deobfuscate obfuscated JavaScript code')
    .version(VERSION)
    .argument('[input]', 'Input file path (use "-" for stdin)')
    .argument('[output]', 'Output file path (omit or use "-" for stdout)')
    .option(
      '--provider <name>',
      'LLM provider (openai, anthropic, gemini, ollama)',
      'openai'
    )
    .option('--model <name>', 'Model name to use', 'gpt-4')
    .option(
      '--api-key <key>',
      'API key for the provider (or use CASCADE_API_KEY env var)'
    )
    .option('--timeout <ms>', 'Timeout in milliseconds', '60000')
    .option('--verbose', 'Enable verbose output with timing')
    .option('--quiet', 'Suppress all output except the result')
    .option('--no-prefilter', 'Skip obfuscation detection')
    .option('--json', 'Output result as JSON instead of plain code')
    .option('--base-url <url>', 'Custom base URL for the LLM provider API endpoint')
    .action(async (input: string | undefined, output: string | undefined, options: CLIOptions) => {
      try {
        // Get API key from option or environment variable
        const apiKey = options.apiKey || process.env.CASCADE_API_KEY;
        if (!apiKey && options.provider !== 'ollama') {
          throw new Error(
            `API key required. Set --api-key or CASCADE_API_KEY environment variable`
          );
        }

        // Parse timeout
        const timeoutMs = parseInt(options.timeout, 10);
        if (isNaN(timeoutMs) || timeoutMs <= 0) {
          throw new Error('Timeout must be a positive number');
        }

        if (!options.quiet) {
          process.stderr.write(`Cascading deobfuscation...\n`);
        }

        // Read input
        const inputCode = await readInput(input);

        // Create adapter
        const adapter = createAdapter(options.provider, options.model, apiKey || '', options.baseUrl);

        // Prepare deobfuscate options
        const deobfuscateOptions: DeobfuscateOptions = {
          llmAdapter: adapter,
          timeout: timeoutMs,
          skipPrefilter: options.noPrefilter,
        };

        // Deobfuscate
        const startTime = Date.now();
        const result = await deobfuscate(inputCode, deobfuscateOptions);
        const elapsed = Date.now() - startTime;

        // Handle output
        if (options.json) {
          const jsonOutput = JSON.stringify(
            {
              code: result.code,
              warnings: result.warnings,
              stats: {
                ...result.stats,
                elapsedMs: elapsed,
              },
            },
            null,
            2
          );
          writeOutput(jsonOutput, output);
        } else {
          writeOutput(result.code, output);
          // Print stats to stderr
          printStats({ ...result.stats, elapsedMs: elapsed }, options.verbose, false);
        }

        if (!options.quiet && !options.json) {
          if (result.warnings.length > 0) {
            process.stderr.write('\n⚠️  Warnings:\n');
            for (const warning of result.warnings) {
              process.stderr.write(`  - ${warning}\n`);
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`❌ Error: ${message}\n`);
        process.exit(1);
      }
    });

  program.parse();
}

// Run CLI
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`❌ Fatal error: ${message}\n`);
  process.exit(1);
});
