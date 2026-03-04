import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import type * as babel from '@babel/types';
import type { TaggedStatement } from '../types.js';

export interface SplitResult {
  ast: babel.File;
  statements: TaggedStatement[];
}

/**
 * Parses JavaScript code into a Babel AST and splits it into tagged statements.
 * Each top-level statement gets a sequential ID and records its source position.
 * 
 * @param code - JavaScript code to parse and tag
 * @returns Object containing the parsed AST and array of tagged statements
 * @throws {SyntaxError} If the code contains syntax errors
 */
export function parseAndTag(code: string): SplitResult {
  // Parse the code with Babel
  const ast = parse(code, {
    sourceType: 'unambiguous', // Auto-detect script vs module
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
  });

  const statements: TaggedStatement[] = [];
  let id = 0;

  // Traverse the AST and collect top-level statements
  if (ast.program && ast.program.body) {
    for (const node of ast.program.body) {
      const start = node.start ?? 0;
      const end = node.end ?? code.length;

      statements.push({
        id: id++,
        code: code.slice(start, end),
        start,
        end,
      });
    }
  }

  return { ast, statements };
}

/**
 * Counts the number of top-level statements in JavaScript code.
 * 
 * @param code - JavaScript code to analyze
 * @returns Number of top-level statements
 */
export function countStatements(code: string): number {
  const { statements } = parseAndTag(code);
  return statements.length;
}
