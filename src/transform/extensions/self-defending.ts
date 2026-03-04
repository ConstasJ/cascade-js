/**
 * Self Defending Removal Pass
 *
 * Removes the "Self Defending" protection from javascript-obfuscator.
 * Self defending uses ReDoS patterns to cause infinite loops if code is reformatted.
 *
 * Pattern:
 *   var _0xfunc = function() {
 *     var _0xresult = new RegExp('...');
 *     return _0xfunc.toString().search('(((.+)+)+)+$').toString().constructor(fn).search('(((.+)+)+)+$');
 *   };
 *   _0xfunc();
 *
 * Also detects the "SingleCallController" pattern used by several protections:
 *   (function() {
 *     var _0xfirstCall = true;
 *     return function(_0xctx, _0xfn) {
 *       var _0xfunc = _0xfirstCall ? function() {
 *         if (_0xfn) { var result = _0xfn.apply(_0xctx, arguments); _0xfn = null; return result; }
 *       } : function() {};
 *       _0xfirstCall = false;
 *       return _0xfunc;
 *     };
 *   })()
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
 * Check if code contains ReDoS pattern strings
 */
function containsReDoSPattern(code: string): boolean {
  return code.includes('(((.+)+)+)+$') || code.includes('((.+)+)+$');
}

/**
 * Check if a function body matches the self-defending pattern:
 * - Contains .toString()
 * - Contains .search() with ReDoS regex
 * - Or contains .constructor() pattern
 */
function isSelfDefendingBody(node: t.Node): boolean {
  const code = generate(node).code;
  return (
    (code.includes('.toString()') && containsReDoSPattern(code)) ||
    (code.includes('.constructor(') && containsReDoSPattern(code)) ||
    (code.includes('toString') && code.includes('search') && code.includes('(('))
  );
}

/**
 * Detect if a node is a "SingleCallController" IIFE
 * Used by self-defending, console disable, and domain lock
 */
function isSingleCallController(node: t.Node): boolean {
  const code = generate(node).code;
  return (
    code.includes('firstCall') ||
    (code.includes('apply') && code.includes('arguments') && (code.includes('true') || code.includes('![]')))
  );
}

export const selfDefendingPass = definePass({
  name: 'self-defending',
  async transform(code: string, context: PipelineContext) {
    // Quick check: if no ReDoS pattern exists, skip
    if (!containsReDoSPattern(code) && !code.includes('toString') && !code.includes('.constructor(')) {
      return code;
    }

    const ast = parse(code, { sourceType: 'unambiguous' });
    let changed = false;

    traverse(ast, {
      // Remove self-defending function declarations
      FunctionDeclaration(path: any) {
        if (isSelfDefendingBody(path.node.body)) {
          // Also remove calls to this function
          const funcName = path.node.id?.name;
          if (funcName) {
            const binding = path.scope.getBinding(funcName);
            if (binding) {
              for (const ref of binding.referencePaths) {
                const callExpr = ref.parentPath;
                if (callExpr && t.isCallExpression(callExpr.node) && callExpr.parentPath?.isExpressionStatement()) {
                  callExpr.parentPath.remove();
                }
              }
            }
          }
          path.remove();
          changed = true;
        }
      },

      // Remove self-defending variable functions
      VariableDeclarator(path: any) {
        if (!t.isFunctionExpression(path.node.init) && !t.isArrowFunctionExpression(path.node.init)) return;
        const funcBody = t.isBlockStatement(path.node.init.body) ? path.node.init.body : null;
        if (!funcBody) return;

        if (isSelfDefendingBody(funcBody)) {
          const varName = t.isIdentifier(path.node.id) ? path.node.id.name : null;
          if (varName) {
            const binding = path.scope.getBinding(varName);
            if (binding) {
              for (const ref of binding.referencePaths) {
                const callExpr = ref.parentPath;
                if (callExpr && t.isCallExpression(callExpr.node) && callExpr.parentPath?.isExpressionStatement()) {
                  callExpr.parentPath.remove();
                }
              }
            }
          }
          const parent = path.parentPath;
          if (parent && t.isVariableDeclaration(parent.node) && parent.node.declarations.length === 1) {
            parent.remove();
          } else {
            path.remove();
          }
          changed = true;
        }
      },

      // Remove IIFEs that are self-defending controllers
      ExpressionStatement(path: any) {
        if (!t.isCallExpression(path.node.expression)) return;
        const callee = path.node.expression.callee;
        if (!t.isFunctionExpression(callee) && !t.isArrowFunctionExpression(callee)) return;

        const funcBody = t.isBlockStatement(callee.body) ? callee.body : null;
        if (!funcBody) return;

        if (isSelfDefendingBody(funcBody)) {
          path.remove();
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
