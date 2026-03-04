/**
 * Numbers to Expressions Pass
 *
 * Reverses the "Numbers To Expressions" obfuscation technique where
 * numeric values are decomposed into arithmetic expressions.
 *
 * Example:
 *   50 + (100 * 2) - 127  →  123
 *   -~[]                   →  1
 *   +(1 + 1)               →  2
 *
 * Uses Babel's path.evaluate() to compute constant expressions.
 */

import { parse } from '@babel/parser';
import traverseDefault from '@babel/traverse';
import generateDefault from '@babel/generator';
import * as t from '@babel/types';
import { definePass } from '../../pipeline/pass.js';
import type { PipelineContext } from '../../pipeline/pipeline.js';

const traverse = typeof traverseDefault === 'function' ? traverseDefault : (traverseDefault as any).default;
const generate = typeof generateDefault === 'function' ? generateDefault : (generateDefault as any).default;

/**
 * Check if a node is a numeric expression (BinaryExpression/UnaryExpression
 * tree with only numeric literal leaves).
 */
function isNumericExpression(node: t.Node): boolean {
  if (t.isNumericLiteral(node)) return true;

  if (t.isUnaryExpression(node)) {
    return (node.operator === '-' || node.operator === '+' || node.operator === '~' || node.operator === '!') &&
      isNumericExpression(node.argument);
  }

  if (t.isBinaryExpression(node)) {
    const numericOps = ['+', '-', '*', '/', '%', '**', '&', '|', '>>', '>>>', '<<', '^'];
    if (!numericOps.includes(node.operator)) return false;
    return isNumericExpression(node.left) && isNumericExpression(node.right);
  }

  // Handle ~[] (which evaluates to -1), ![] (false/0), !![] (true/1)
  if (t.isUnaryExpression(node) && t.isArrayExpression((node as any).argument) && (node as any).argument.elements.length === 0) {
    return true;
  }

  return false;
}

export const numbersToExpressionsPass = definePass({
  name: 'numbers-to-expressions',
  async transform(code: string, context: PipelineContext) {
    const ast = parse(code, { sourceType: 'unambiguous' });
    let changed = false;

    traverse(ast, {
      // Handle binary expressions that evaluate to numbers
      BinaryExpression(path: any) {
        // Don't process if parent is also a binary expression (let parent handle it)
        if (t.isBinaryExpression(path.parent)) return;

        // Only process if the entire tree is numeric
        if (!isNumericExpression(path.node)) return;

        const result = path.evaluate();
        if (result.confident && typeof result.value === 'number') {
          // Skip non-integer results from division to avoid precision issues
          if (!Number.isInteger(result.value) && path.node.operator === '/') return;
          // Skip Infinity and NaN
          if (!Number.isFinite(result.value)) return;

          path.replaceWith(t.numericLiteral(result.value));
          changed = true;
        }
      },
      // Handle unary expressions on numeric literals: -(-5) → 5, ~~x, etc.
      UnaryExpression(path: any) {
        if (t.isBinaryExpression(path.parent)) return;
        if (t.isUnaryExpression(path.parent)) return;

        if (!isNumericExpression(path.node)) return;

        const result = path.evaluate();
        if (result.confident && typeof result.value === 'number') {
          if (!Number.isFinite(result.value)) return;
          path.replaceWith(t.numericLiteral(result.value));
          changed = true;
        }
      },
    });

    if (changed && context.shared) {
      context.shared.passesApplied = (context.shared.passesApplied ?? 0) + 1;
    }

    return changed ? generate(ast).code : code;
  },
});
