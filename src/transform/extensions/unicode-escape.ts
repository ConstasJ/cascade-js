/**
 * Unicode Escape Sequence Normalization Pass
 *
 * Converts unicode escape sequences in string literals and identifiers
 * back to their readable forms.
 *
 * Examples:
 *   "\x68\x65\x6c\x6c\x6f"   →  "hello"
 *   "\u0068\u0065\u006c\u006c\u006f"  →  "hello"
 *   obj["\x70\x75\x73\x68"]   →  obj["push"]  (or obj.push)
 *
 * Also normalizes:
 *   Hex escape sequences: \x41 → A
 *   Unicode escape sequences: \u0041 → A
 *   Octal escape sequences: \101 → A
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
 * Check if a string contains escape sequences that can be normalized
 */
function hasEscapeSequences(raw: string): boolean {
  return /\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}|\\[0-7]{1,3}/.test(raw);
}

export const unicodeEscapePass = definePass({
  name: 'unicode-escape',
  async transform(code: string, context: PipelineContext) {
    // Quick check: if no escape sequences, skip
    if (!code.includes('\\x') && !code.includes('\\u') && !code.includes('\\0')) {
      return code;
    }

    const ast = parse(code, { sourceType: 'unambiguous' });
    let changed = false;

    traverse(ast, {
      StringLiteral(path: any) {
        // Babel already decodes escape sequences in the `value` property.
        // We need to check if the `extra.raw` differs from what a simple
        // string would produce, indicating escape sequences were used.
        const extra = path.node.extra as { raw?: string; rawValue?: string } | undefined;
        if (extra?.raw && hasEscapeSequences(extra.raw)) {
          // Remove extra so generator produces clean string
          delete path.node.extra;
          changed = true;
        }
      },

      // Also handle computed member expressions with escaped string keys
      // obj["\x70\x75\x73\x68"] → obj.push (if valid identifier)
      MemberExpression(path: any) {
        if (!path.node.computed) return;
        if (!t.isStringLiteral(path.node.property)) return;

        const extra = path.node.property.extra as { raw?: string } | undefined;
        if (extra?.raw && hasEscapeSequences(extra.raw)) {
          delete path.node.property.extra;
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
