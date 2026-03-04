/**
 * Split Strings Pass
 *
 * Reverses the "Split Strings" obfuscation technique where strings are
 * split into concatenated parts.
 *
 * Example:
 *   "hel" + "lo " + "wor" + "ld"  →  "hello world"
 *   'abc' + 'def'                   →  'abcdef'
 *
 * Also handles template literal concatenation:
 *   `hel` + `lo`  →  "hello"
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
 * Collect all string parts from a chain of concatenation (left-associative)
 * Returns null if any part is not a string literal.
 */
function collectStringParts(node: t.Node): string[] | null {
  if (t.isStringLiteral(node)) {
    return [node.value];
  }

  if (t.isTemplateLiteral(node) && node.expressions.length === 0 && node.quasis.length === 1) {
    const quasi = node.quasis[0];
    if (!quasi) return null;
    return [quasi.value.cooked ?? quasi.value.raw];
  }

  if (t.isBinaryExpression(node) && node.operator === '+') {
    const leftParts = collectStringParts(node.left);
    const rightParts = collectStringParts(node.right);
    if (leftParts && rightParts) {
      return [...leftParts, ...rightParts];
    }
  }

  return null;
}

export const splitStringsPass = definePass({
  name: 'split-strings',
  async transform(code: string, context: PipelineContext) {
    const ast = parse(code, { sourceType: 'unambiguous' });
    let changed = false;

    traverse(ast, {
      BinaryExpression(path: any) {
        // Only process top-level concatenation (not nested)
        if (t.isBinaryExpression(path.parent) && path.parent.operator === '+') return;

        if (path.node.operator !== '+') return;

        const parts = collectStringParts(path.node);
        if (parts && parts.length >= 2) {
          const joined = parts.join('');
          path.replaceWith(t.stringLiteral(joined));
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
