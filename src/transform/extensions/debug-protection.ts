/**
 * Debug Protection Removal Pass
 *
 * Removes the "Debug Protection" technique from javascript-obfuscator.
 *
 * Pattern 1: Recursive debugger function
 *   function debuggerProtection(counter) {
 *     (function() { ... debugger; ... })('counter', counter++);
 *     debuggerProtection(++counter);
 *   }
 *
 * Pattern 2: Function constructor debugger
 *   (function() {
 *     function _0xfunc() {
 *       Function('return (function() {}.constructor("return this")( ))').constructor("debugger")();
 *     }
 *     _0xfunc();
 *   })();
 *
 * Pattern 3: setInterval-based continuous debugger
 *   setInterval(function() { debuggerProtection(); }, 4000);
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
 * Check if a node's code contains debugger-related patterns
 */
function isDebuggerProtection(node: t.Node): boolean {
  const code = generate(node).code;
  return (
    code.includes('debugger') ||
    code.includes('"debugger"') ||
    code.includes("'debugger'") ||
    code.includes('.constructor("debugger")')
  );
}

/**
 * Track names of known debug protection functions
 */
const debugProtectionNames = new Set<string>();

export const debugProtectionPass = definePass({
  name: 'debug-protection',
  async transform(code: string, context: PipelineContext) {
    // Quick check: if no debugger keyword exists, skip
    if (!code.includes('debugger')) {
      return code;
    }

    const ast = parse(code, { sourceType: 'unambiguous' });
    let changed = false;
    debugProtectionNames.clear();

    // First pass: identify debug protection functions
    traverse(ast, {
      FunctionDeclaration(path: any) {
        const funcName = path.node.id?.name;
        if (!funcName) return;

        if (isDebuggerProtection(path.node.body)) {
          debugProtectionNames.add(funcName);
        }
      },
      VariableDeclarator(path: any) {
        if (!t.isIdentifier(path.node.id)) return;
        const init = path.node.init;
        if (!t.isFunctionExpression(init) && !t.isArrowFunctionExpression(init)) return;

        const body = t.isBlockStatement(init.body) ? init.body : null;
        if (!body) return;

        if (isDebuggerProtection(body)) {
          debugProtectionNames.add(path.node.id.name);
        }
      },
    });

    // Second pass: remove debug protection code
    traverse(ast, {
      // Remove debug protection function declarations
      FunctionDeclaration(path: any) {
        const funcName = path.node.id?.name;
        if (funcName && debugProtectionNames.has(funcName)) {
          path.remove();
          changed = true;
        }
      },

      // Remove debug protection variable declarations
      VariableDeclarator(path: any) {
        if (!t.isIdentifier(path.node.id)) return;
        if (debugProtectionNames.has(path.node.id.name)) {
          const parent = path.parentPath;
          if (parent && t.isVariableDeclaration(parent.node) && parent.node.declarations.length === 1) {
            parent.remove();
          } else {
            path.remove();
          }
          changed = true;
        }
      },

      // Remove calls to debug protection functions
      ExpressionStatement(path: any) {
        const expr = path.node.expression;

        // Direct calls: debugProtection()
        if (t.isCallExpression(expr) && t.isIdentifier(expr.callee)) {
          if (debugProtectionNames.has(expr.callee.name)) {
            path.remove();
            changed = true;
            return;
          }
        }

        // setInterval calls: setInterval(function() { debugProtection(); }, 4000)
        if (t.isCallExpression(expr) && t.isIdentifier(expr.callee) && expr.callee.name === 'setInterval') {
          const callback = expr.arguments[0];
          if (t.isFunctionExpression(callback) || t.isArrowFunctionExpression(callback)) {
            const body = t.isBlockStatement(callback.body) ? callback.body : null;
            if (body && isDebuggerProtection(body)) {
              path.remove();
              changed = true;
              return;
            }
          }
        }

        // IIFE containing debugger: (function() { ... debugger ... })()
        if (t.isCallExpression(expr)) {
          const callee = expr.callee;
          if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
            const body = t.isBlockStatement(callee.body) ? callee.body : null;
            if (body && isDebuggerProtection(body)) {
              path.remove();
              changed = true;
              return;
            }
          }
        }
      },

      // Remove standalone debugger statements
      DebuggerStatement(path: any) {
        path.remove();
        changed = true;
      },
    });

    if (changed && context.shared) {
      context.shared.passesApplied = (context.shared.passesApplied ?? 0) + 1;
    }

    return changed ? generate(ast).code : code;
  },
});
