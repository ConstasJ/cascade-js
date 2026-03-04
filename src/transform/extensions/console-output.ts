/**
 * Console Output Restoration Pass
 *
 * Reverses the "Disable Console Output" technique from javascript-obfuscator.
 *
 * The obfuscator replaces console methods (log, warn, info, error, exception,
 * table, trace) with no-op functions.
 *
 * Pattern:
 *   var _0xconsole = function() {
 *     var _0xobj = {};
 *     var _0xnames = ['log', 'warn', 'info', 'error', 'exception', 'table', 'trace'];
 *     for (var i = 0; i < _0xnames.length; i++) {
 *       // ... replaces with no-op ...
 *       _0xobj[_0xnames[i]] = _0xempty;
 *     }
 *     return _0xobj;
 *   };
 *   _0xconsole(this, function() { ... });
 *
 * Also matches:
 *   var _0x = (function() {
 *     var _0xfn = function() {};
 *     var _0xprops = ['log', 'warn', ...];
 *     ...
 *     console['log'] = _0xfn;
 *     console['warn'] = _0xfn;
 *   })();
 *
 * The pass detects and removes the console-disabling code entirely.
 */

import { parse } from '@babel/parser';
import traverseDefault from '@babel/traverse';
import generateDefault from '@babel/generator';
import * as t from '@babel/types';
import { definePass } from '../../pipeline/pass.js';
import type { PipelineContext } from '../../pipeline/pipeline.js';

const traverse = typeof traverseDefault === 'function' ? traverseDefault : (traverseDefault as any).default;
const generate = typeof generateDefault === 'function' ? generateDefault : (generateDefault as any).default;

const CONSOLE_METHODS = new Set(['log', 'warn', 'info', 'error', 'exception', 'table', 'trace', 'debug', 'dir', 'dirxml', 'count', 'clear', 'group', 'groupCollapsed', 'groupEnd', 'time', 'timeEnd', 'timeLog', 'assert', 'profile', 'profileEnd']);

/**
 * Check if code contains console method name strings (indicating console manipulation)
 */
function containsConsoleMethodStrings(code: string): boolean {
  let count = 0;
  for (const method of ['log', 'warn', 'info', 'error', 'exception', 'table', 'trace']) {
    if (code.includes(`'${method}'`) || code.includes(`"${method}"`)) {
      count++;
    }
  }
  return count >= 3; // At least 3 console methods referenced as strings
}

/**
 * Check if node directly assigns to console properties
 */
function isConsoleAssignment(node: t.Node): boolean {
  if (!t.isAssignmentExpression(node)) return false;
  if (!t.isMemberExpression(node.left)) return false;
  if (!t.isIdentifier(node.left.object)) return false;
  if (node.left.object.name !== 'console') return false;

  let propName: string | null = null;
  if (t.isIdentifier(node.left.property) && !node.left.computed) {
    propName = node.left.property.name;
  } else if (t.isStringLiteral(node.left.property)) {
    propName = node.left.property.value;
  }

  return propName !== null && CONSOLE_METHODS.has(propName);
}

export const consoleOutputPass = definePass({
  name: 'console-output',
  async transform(code: string, context: PipelineContext) {
    // Quick check: if 'console' doesn't appear, skip
    if (!code.includes('console')) return code;

    const ast = parse(code, { sourceType: 'unambiguous' });
    let changed = false;

    const consoleDisablerNames = new Set<string>();

    traverse(ast, {
      // Detect function declarations that disable console
      FunctionDeclaration(path: any) {
        const funcName = path.node.id?.name;
        if (!funcName) return;

        const funcCode = generate(path.node.body).code;
        if (containsConsoleMethodStrings(funcCode) || funcCode.includes('console')) {
          // Check if the function body assigns to console methods or has console method strings
          let hasConsoleManipulation = false;

          path.traverse({
            AssignmentExpression(innerPath: any) {
              if (isConsoleAssignment(innerPath.node)) {
                hasConsoleManipulation = true;
              }
            },
          });

          // Also detect the pattern where console methods are iterated and replaced
          if (!hasConsoleManipulation && containsConsoleMethodStrings(funcCode)) {
            hasConsoleManipulation = true;
          }

          if (hasConsoleManipulation) {
            consoleDisablerNames.add(funcName);
          }
        }
      },

      // Detect variable-assigned functions that disable console
      VariableDeclarator(path: any) {
        if (!t.isIdentifier(path.node.id)) return;
        const init = path.node.init;
        if (!t.isFunctionExpression(init) && !t.isArrowFunctionExpression(init)) return;

        const funcCode = generate(init).code;
        if (containsConsoleMethodStrings(funcCode)) {
          consoleDisablerNames.add(path.node.id.name);
        }
      },

      // Remove IIFEs that disable console
      ExpressionStatement(path: any) {
        const expr = path.node.expression;
        if (!t.isCallExpression(expr)) return;

        const callee = expr.callee;
        if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
          const funcCode = generate(callee).code;
          if (containsConsoleMethodStrings(funcCode)) {
            path.remove();
            changed = true;
            return;
          }
        }
      },

      // Remove direct console assignments: console.log = function() {}
      AssignmentExpression(path: any) {
        if (isConsoleAssignment(path.node)) {
          if (path.parentPath?.isExpressionStatement()) {
            path.parentPath.remove();
            changed = true;
          }
        }
      },
    });

    // Second pass: remove console disabler functions and their call sites
    if (consoleDisablerNames.size > 0) {
      traverse(ast, {
        FunctionDeclaration(path: any) {
          const funcName = path.node.id?.name;
          if (funcName && consoleDisablerNames.has(funcName)) {
            path.remove();
            changed = true;
          }
        },
        VariableDeclarator(path: any) {
          if (t.isIdentifier(path.node.id) && consoleDisablerNames.has(path.node.id.name)) {
            const parent = path.parentPath;
            if (parent && t.isVariableDeclaration(parent.node) && parent.node.declarations.length === 1) {
              parent.remove();
            } else {
              path.remove();
            }
            changed = true;
          }
        },
        ExpressionStatement(path: any) {
          const expr = path.node.expression;
          if (t.isCallExpression(expr) && t.isIdentifier(expr.callee) && consoleDisablerNames.has(expr.callee.name)) {
            path.remove();
            changed = true;
          }
        },
      });
    }

    if (changed && context.shared) {
      context.shared.passesApplied = (context.shared.passesApplied ?? 0) + 1;
    }

    return changed ? generate(ast).code : code;
  },
});
