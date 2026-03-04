/**
 * Domain Lock Removal Pass
 *
 * Removes the "Domain Lock" protection from javascript-obfuscator.
 *
 * The domain lock uses character code detection to find 'document', 'domain',
 * 'location', 'hostname' properties, then checks against a whitelist of domains.
 * If the domain doesn't match, it redirects or prevents execution.
 *
 * Pattern characteristics:
 * - Uses charCodeAt to detect property names character by character
 * - Contains string matching against domain/hostname
 * - Often uses RegExp with obfuscated domain patterns
 * - Redirects via assigning to window.location or throwing errors
 *
 * Detection heuristics:
 * - charCodeAt chains building 'document', 'domain', 'location', 'hostname'
 * - Test against window.location.hostname or document.domain
 * - Contains a list of allowed domains
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
 * Detect domain lock patterns in code
 */
function isDomainLockCode(code: string): boolean {
  const indicators = [
    // CharCode-based property detection
    code.includes('charCodeAt') && (
      code.includes('document') || code.includes('location') || code.includes('hostname') || code.includes('domain')
    ),
    // Direct domain checking
    code.includes('location') && code.includes('hostname') && (code.includes('match') || code.includes('test') || code.includes('indexOf')),
    // window.location redirect
    code.includes('location') && code.includes('href') && code.includes('http'),
    // RegExp domain matching
    code.includes('RegExp') && (code.includes('hostname') || code.includes('domain')),
  ];

  // Need at least 2 indicators
  return indicators.filter(Boolean).length >= 2;
}

/**
 * Check if a function body contains domain lock patterns
 */
function hasDomainLockPattern(node: t.Node): boolean {
  const code = generate(node).code;
  return isDomainLockCode(code);
}

export const domainLockPass = definePass({
  name: 'domain-lock',
  async transform(code: string, context: PipelineContext) {
    // Quick check: domain lock always references location/hostname
    if (!code.includes('hostname') && !code.includes('domain') && !code.includes('charCodeAt')) {
      return code;
    }

    const ast = parse(code, { sourceType: 'unambiguous' });
    let changed = false;

    const domainLockNames = new Set<string>();

    traverse(ast, {
      // Detect domain lock function declarations
      FunctionDeclaration(path: any) {
        const funcName = path.node.id?.name;
        if (!funcName) return;

        if (hasDomainLockPattern(path.node.body)) {
          domainLockNames.add(funcName);
          path.remove();
          changed = true;
        }
      },

      // Detect domain lock variable functions
      VariableDeclarator(path: any) {
        if (!t.isIdentifier(path.node.id)) return;
        const init = path.node.init;
        if (!t.isFunctionExpression(init) && !t.isArrowFunctionExpression(init)) return;

        const body = t.isBlockStatement(init.body) ? init.body : null;
        if (!body) return;

        if (hasDomainLockPattern(body)) {
          domainLockNames.add(path.node.id.name);
          const parent = path.parentPath;
          if (parent && t.isVariableDeclaration(parent.node) && parent.node.declarations.length === 1) {
            parent.remove();
          } else {
            path.remove();
          }
          changed = true;
        }
      },

      // Remove domain lock IIFEs
      ExpressionStatement(path: any) {
        const expr = path.node.expression;

        // IIFE: (function() { ... domain lock ... })()
        if (t.isCallExpression(expr)) {
          const callee = expr.callee;
          if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
            const body = t.isBlockStatement(callee.body) ? callee.body : null;
            if (body && hasDomainLockPattern(body)) {
              path.remove();
              changed = true;
              return;
            }
          }

          // Call to domain lock function: domainLock()
          if (t.isIdentifier(callee) && domainLockNames.has(callee.name)) {
            path.remove();
            changed = true;
          }
        }
      },
    });

    if (changed && context.shared) {
      context.shared.passesApplied = (context.shared.passesApplied ?? 0) + 1;
    }

    return changed ? generate(ast).code : code;
  },
});
