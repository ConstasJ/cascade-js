/**
 * Unminify Pass
 *
 * Converts minified/obfuscated syntax back to readable, idiomatic JavaScript.
 * Unlike most "unminify" tools that only format code, this pass transforms
 * syntax patterns back to their more readable equivalents.
 *
 * Transforms included:
 * 1.  Computed to dot properties: obj["prop"] → obj.prop
 * 2.  Sequence to statements: (a(), b(), c()) → a(); b(); c();
 * 3.  Void to undefined: void 0 → undefined
 * 4.  Merge strings: "a" + "b" → "ab" (handled by split-strings pass)
 * 5.  Yoda conditions: "string" === x → x === "string"
 * 6.  Block statements: if(x) y → if(x) { y }
 * 7.  Split variable declarations: var a=1, b=2 → var a=1; var b=2;
 * 8.  Ternary to if: cond ? a() : b() → if(cond) { a() } else { b() }
 * 9.  Logical to if: a && b() → if(a) { b() }
 * 10. For to while: for(;;) → while(true)
 * 11. Infinity: 1/0 → Infinity, -1/0 → -Infinity
 * 12. Remove double negation: !!x → x (in boolean contexts)
 * 13. JSON.parse evaluation: JSON.parse('{"a":1}') → {a: 1}
 * 14. Merge else-if: else { if(x) {} } → else if(x) {}
 * 15. typeof undefined: typeof x === "undefined" → x === undefined
 * 16. Unary expressions: -(-x) → x, +x → x (when numeric)
 */

import { parse } from '@babel/parser';
import traverseDefault from '@babel/traverse';
import generateDefault from '@babel/generator';
import * as t from '@babel/types';
import { definePass } from '../../pipeline/pass.js';
import type { PipelineContext } from '../../pipeline/pipeline.js';

const traverse = typeof traverseDefault === 'function' ? traverseDefault : (traverseDefault as any).default;
const generate = typeof generateDefault === 'function' ? generateDefault : (generateDefault as any).default;

// Valid JS identifier regex (simplified — covers most common cases)
const VALID_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

// JS reserved words that cannot be used as dot-access properties
const RESERVED_WORDS = new Set([
  'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof', 'new',
  'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'class', 'const', 'enum', 'export', 'extends', 'import',
  'super', 'implements', 'interface', 'let', 'package', 'private', 'protected',
  'public', 'static', 'yield',
]);

/**
 * Check if a string is a valid JavaScript identifier that can be used with dot notation
 */
function isValidDotProperty(name: string): boolean {
  return VALID_IDENTIFIER.test(name) && !RESERVED_WORDS.has(name);
}

/**
 * Check if a literal is on the left side of a comparison (Yoda condition)
 */
function isYodaCondition(node: t.BinaryExpression): boolean {
  const yodaOps = ['===', '!==', '==', '!='];
  if (!yodaOps.includes(node.operator)) return false;

  const leftIsLiteral = t.isStringLiteral(node.left) || t.isNumericLiteral(node.left) ||
    t.isBooleanLiteral(node.left) || t.isNullLiteral(node.left);
  const rightIsLiteral = t.isStringLiteral(node.right) || t.isNumericLiteral(node.right) ||
    t.isBooleanLiteral(node.right) || t.isNullLiteral(node.right);

  return leftIsLiteral && !rightIsLiteral;
}

/**
 * Flatten a SequenceExpression into individual statements
 */
function sequenceToStatements(expressions: t.Expression[]): t.Statement[] {
  return expressions.map(expr => t.expressionStatement(expr));
}

export const unminifyPass = definePass({
  name: 'unminify',
  async transform(code: string, context: PipelineContext) {
    const ast = parse(code, { sourceType: 'unambiguous' });
    let changed = false;

    // Multiple traversal passes for different transforms
    // (some transforms may create opportunities for others)

    // Pass 1: Structural transforms
    traverse(ast, {
      // 1. Computed to dot properties: obj["prop"] → obj.prop
      MemberExpression(path: any) {
        if (!path.node.computed) return;
        if (!t.isStringLiteral(path.node.property)) return;

        const propName = path.node.property.value;
        if (isValidDotProperty(propName)) {
          path.node.computed = false;
          path.node.property = t.identifier(propName);
          changed = true;
        }
      },

      // 2. Sequence expression to statements (only at ExpressionStatement level)
      ExpressionStatement(path: any) {
        if (!t.isSequenceExpression(path.node.expression)) return;

        const statements = sequenceToStatements(path.node.expression.expressions);
        path.replaceWithMultiple(statements);
        changed = true;
      },

      // 3. Void 0 → undefined
      UnaryExpression(path: any) {
        if (path.node.operator === 'void' && t.isNumericLiteral(path.node.argument) && path.node.argument.value === 0) {
          path.replaceWith(t.identifier('undefined'));
          changed = true;
        }
      },

      // 5. Yoda conditions: "string" === x → x === "string"
      BinaryExpression(path: any) {
        if (isYodaCondition(path.node)) {
          const temp = path.node.left;
          path.node.left = path.node.right;
          path.node.right = temp;

          // Flip the operator if needed
          const opMap: Record<string, string> = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' };
          if (opMap[path.node.operator]) {
            path.node.operator = opMap[path.node.operator] as t.BinaryExpression['operator'];
          }
          changed = true;
        }

        // 11. Infinity: 1/0 → Infinity
        if (path.node.operator === '/' &&
          t.isNumericLiteral(path.node.left) && t.isNumericLiteral(path.node.right) &&
          path.node.right.value === 0) {
          if (path.node.left.value === 1) {
            path.replaceWith(t.identifier('Infinity'));
            changed = true;
          } else if (path.node.left.value === -1) {
            path.replaceWith(t.unaryExpression('-', t.identifier('Infinity')));
            changed = true;
          }
        }
      },

      // 6. Block statements + 14. Merge else-if
      IfStatement: {
        enter(path: any) {
          if (path.node.consequent && !t.isBlockStatement(path.node.consequent)) {
            path.node.consequent = t.blockStatement([
              t.isExpressionStatement(path.node.consequent)
                ? path.node.consequent
                : t.isReturnStatement(path.node.consequent)
                  ? path.node.consequent
                  : t.expressionStatement(path.node.consequent as unknown as t.Expression),
            ]);
            changed = true;
          }
          if (path.node.alternate && !t.isBlockStatement(path.node.alternate) && !t.isIfStatement(path.node.alternate)) {
            path.node.alternate = t.blockStatement([
              t.isExpressionStatement(path.node.alternate)
                ? path.node.alternate
                : t.isReturnStatement(path.node.alternate)
                  ? path.node.alternate
                  : t.expressionStatement(path.node.alternate as unknown as t.Expression),
            ]);
            changed = true;
          }
        },

        // 14. Merge else-if: else { if(x) {} } → else if(x) {}
        exit(path: any) {
          if (!path.node.alternate) return;
          if (!t.isBlockStatement(path.node.alternate)) return;

          const block = path.node.alternate;
          if (block.body.length === 1 && t.isIfStatement(block.body[0])) {
            path.node.alternate = block.body[0];
            changed = true;
          }
        },
      },

      ForStatement(path: any) {
        // 10. For(;;) → while(true)
        if (!path.node.init && !path.node.test && !path.node.update) {
          const body = path.node.body;
          const whileStmt = t.whileStatement(t.booleanLiteral(true), body);
          path.replaceWith(whileStmt);
          changed = true;
          return;
        }

        // Add braces to for body
        if (!t.isBlockStatement(path.node.body)) {
          path.node.body = t.blockStatement([path.node.body]);
          changed = true;
        }
      },

      WhileStatement(path: any) {
        if (!t.isBlockStatement(path.node.body)) {
          path.node.body = t.blockStatement([path.node.body]);
          changed = true;
        }
      },

    });

    // Pass 2: Expression-level transforms
    traverse(ast, {
      // 9. Logical to if: a && b() → if(a) { b() } (only when used as statement)
      ExpressionStatement(path: any) {
        const expr = path.node.expression;

        if (t.isLogicalExpression(expr) && expr.operator === '&&') {
          const ifStmt = t.ifStatement(
            expr.left,
            t.blockStatement([t.expressionStatement(expr.right)]),
          );
          path.replaceWith(ifStmt);
          changed = true;
          return;
        }

        // a || b() → if(!a) { b() }
        if (t.isLogicalExpression(expr) && expr.operator === '||') {
          const ifStmt = t.ifStatement(
            t.unaryExpression('!', expr.left),
            t.blockStatement([t.expressionStatement(expr.right)]),
          );
          path.replaceWith(ifStmt);
          changed = true;
          return;
        }

        // 8. Ternary to if (only when used as statement)
        if (t.isConditionalExpression(expr)) {
          const ifStmt = t.ifStatement(
            expr.test,
            t.blockStatement([t.expressionStatement(expr.consequent)]),
            t.blockStatement([t.expressionStatement(expr.alternate)]),
          );
          path.replaceWith(ifStmt);
          changed = true;
          return;
        }
      },

      // 7. Split variable declarations: var a=1, b=2 → var a=1; var b=2;
      VariableDeclaration(path: any) {
        if (path.node.declarations.length <= 1) return;
        // Only split if parent is a block or program
        if (!t.isBlockStatement(path.parent) && !t.isProgram(path.parent)) return;
        // Don't split for-loop initializers
        if (t.isForStatement(path.parent)) return;

        const kind = path.node.kind;
        const statements = path.node.declarations.map((decl: any) =>
          t.variableDeclaration(kind, [decl]),
        );
        path.replaceWithMultiple(statements);
        changed = true;
      },

      // 12. Remove double negation in boolean contexts: !!x → x
      UnaryExpression(path: any) {
        if (path.node.operator !== '!') return;
        if (!t.isUnaryExpression(path.node.argument)) return;
        if (path.node.argument.operator !== '!') return;

        // Only remove !! in boolean contexts (if test, while test, logical expressions, ternary test)
        const parent = path.parent;
        const isBooleanContext =
          (t.isIfStatement(parent) && parent.test === path.node) ||
          (t.isWhileStatement(parent) && parent.test === path.node) ||
          (t.isDoWhileStatement(parent) && parent.test === path.node) ||
          (t.isConditionalExpression(parent) && parent.test === path.node) ||
          (t.isLogicalExpression(parent)) ||
          (t.isUnaryExpression(parent) && parent.operator === '!');

        if (isBooleanContext) {
          path.replaceWith(path.node.argument.argument);
          changed = true;
        }
      },
    });

    // Pass 3: Evaluation transforms
    traverse(ast, {
      // 13. JSON.parse evaluation
      CallExpression(path: any) {
        // JSON.parse('...')
        if (t.isMemberExpression(path.node.callee) &&
          t.isIdentifier(path.node.callee.object) && path.node.callee.object.name === 'JSON' &&
          t.isIdentifier(path.node.callee.property) && path.node.callee.property.name === 'parse' &&
          path.node.arguments.length === 1 && t.isStringLiteral(path.node.arguments[0])) {
          try {
            const parsed = JSON.parse(path.node.arguments[0].value);
            const astNode = valueToAST(parsed);
            if (astNode) {
              path.replaceWith(astNode);
              changed = true;
            }
          } catch {
            // Invalid JSON, skip
          }
        }

        // Evaluate safe global functions: parseInt("123") → 123, etc.
        if (t.isIdentifier(path.node.callee) && path.node.arguments.length === 1) {
          const funcName = path.node.callee.name;
          const arg = path.node.arguments[0];

          if (funcName === 'parseInt' && t.isStringLiteral(arg)) {
            const result = parseInt(arg.value, 10);
            if (!isNaN(result) && isFinite(result)) {
              path.replaceWith(t.numericLiteral(result));
              changed = true;
            }
          } else if (funcName === 'parseFloat' && t.isStringLiteral(arg)) {
            const result = parseFloat(arg.value);
            if (!isNaN(result) && isFinite(result)) {
              path.replaceWith(t.numericLiteral(result));
              changed = true;
            }
          }
        }
      },

      // 15. typeof undefined normalization (optional, conservative)
      // typeof x === "undefined" → x === undefined (only for known vars)
      // Skipped: this changes semantics for undeclared variables
    });

    if (changed && context.shared) {
      context.shared.passesApplied = (context.shared.passesApplied ?? 0) + 1;
    }

    return changed ? generate(ast).code : code;
  },
});

/**
 * Convert a plain JavaScript value to a Babel AST node
 */
function valueToAST(value: unknown): t.Expression | null {
  if (value === null) return t.nullLiteral();
  if (value === undefined) return t.identifier('undefined');
  if (typeof value === 'string') return t.stringLiteral(value);
  if (typeof value === 'number') return t.numericLiteral(value);
  if (typeof value === 'boolean') return t.booleanLiteral(value);

  if (Array.isArray(value)) {
    const elements = value.map(el => valueToAST(el));
    if (elements.some(el => el === null)) return null;
    return t.arrayExpression(elements as t.Expression[]);
  }

  if (typeof value === 'object') {
    const properties: t.ObjectProperty[] = [];
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const astValue = valueToAST(val);
      if (!astValue) return null;
      properties.push(
        t.objectProperty(
          isValidDotProperty(key) ? t.identifier(key) : t.stringLiteral(key),
          astValue,
        ),
      );
    }
    return t.objectExpression(properties);
  }

  return null;
}
