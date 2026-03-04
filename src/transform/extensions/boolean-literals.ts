import traverseDefault from '@babel/traverse';
import * as t from '@babel/types';
import { parse } from '@babel/parser';
import generateDefault from '@babel/generator';
import { definePass } from '../../pipeline/pass.js';
import type { PipelineContext } from '../../pipeline/pipeline.js';

// Handle both ESM and CJS imports
const traverse = typeof traverseDefault === 'function' ? traverseDefault : (traverseDefault as any).default;
const generate = typeof generateDefault === 'function' ? generateDefault : (generateDefault as any).default;

/**
 * Boolean Literals Pass
 * Transforms logical NOT operations on literals to their boolean equivalents:
 * - ![] → false (empty array is truthy, so NOT is false)
 * - !![] → true (double NOT of truthy value)
 * - !0 → true (0 is falsy)
 * - !1 → false (1 is truthy)
 * - !'' → true (empty string is falsy)
 * - !!'' → false (double NOT of falsy value)
 */
export const booleanLiteralsPass = definePass({
  name: 'boolean-literals',

  async transform(code: string, context: PipelineContext) {
    // Parse code to AST
    const ast = parse(code, { sourceType: 'script' });

    // Transform logical NOT operations on literals
    traverse(ast, {
      UnaryExpression(path: any) {
        const { operator, argument } = path.node;

        // Only process NOT (!) operations
        if (operator !== '!') return;

        // Check if it's a double NOT (!!expression)
        const isDoubleNot = t.isUnaryExpression(argument) && argument.operator === '!' && argument.prefix;

        // Get the innermost operand for evaluation
        const innerOperand = isDoubleNot ? (argument as any).argument : argument;

        // Determine the boolean value based on the operand
        let boolValue: boolean | null = null;

        if (t.isArrayExpression(innerOperand)) {
          // Arrays are always truthy, so:
          // ![] = false
          // !![] = true
          boolValue = isDoubleNot;
        } else if (t.isNumericLiteral(innerOperand)) {
          // Numbers: 0 is falsy, all others are truthy
          // !0 = true, !1 = false
          // !!0 = false, !!1 = true
          boolValue = isDoubleNot ? innerOperand.value !== 0 : innerOperand.value === 0;
        } else if (t.isStringLiteral(innerOperand)) {
          // Strings: empty string is falsy, non-empty is truthy
          // !'' = true, !'x' = false
          // !!'' = false, !!'x' = true
          boolValue = isDoubleNot ? innerOperand.value.length > 0 : innerOperand.value.length === 0;
        } else if (t.isNullLiteral(innerOperand)) {
          // null is falsy
          // !null = true
          // !!null = false
          boolValue = !isDoubleNot;
        } else if (t.isBooleanLiteral(innerOperand)) {
          // Apply NOT to the boolean
          // !true = false, !false = true
          // !!true = true, !!false = false
          boolValue = isDoubleNot ? innerOperand.value : !innerOperand.value;
        }

        // Replace with boolean literal if we determined a value
        if (boolValue !== null) {
          path.replaceWith(t.booleanLiteral(boolValue));
        }
      },
    });

    // Track that this pass was applied
    if (context.shared) {
      if (!context.shared.passesApplied) {
        context.shared.passesApplied = [];
      }
      context.shared.passesApplied.push('boolean-literals');
    }

    // Generate code from AST
    return generate(ast).code;
  },
});
