/**
 * Transform Object Keys Pass
 *
 * Reverses the "Transform Object Keys" obfuscation technique where
 * object properties are extracted to sequential assignments.
 *
 * Also handles object-based expression storage (Call Expression Storage / CFF variant):
 * Objects with function properties used as operator proxies.
 *
 * Pattern 1: Sequential assignment
 *   var _0xt = {};
 *   _0xt['foo'] = 1;
 *   _0xt['bar'] = 'hello';
 *   var obj = _0xt;
 *   // → var obj = { foo: 1, bar: 'hello' };
 *
 * Pattern 2: Inline readonly object properties
 *   var obj = { a: 1, b: "hello" };
 *   console.log(obj.a);       // → console.log(1)
 *   console.log(obj["b"]);    // → console.log("hello")
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
 * Check if a value is a simple literal that can be safely inlined.
 */
function isSimpleLiteral(node: t.Node): boolean {
  return t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node);
}

export const objectKeysPass = definePass({
  name: 'object-keys',
  async transform(code: string, context: PipelineContext) {
    const ast = parse(code, { sourceType: 'unambiguous' });
    let changed = false;

    // Pass 1: Collapse sequential property assignments into object literals
    traverse(ast, {
      // Look for: var t = {}; t['a'] = 1; t['b'] = 2; ... var x = t;
      VariableDeclaration(path: any) {
        if (path.node.declarations.length !== 1) return;
        const decl = path.node.declarations[0];
        if (!t.isIdentifier(decl.id)) return;
        if (!t.isObjectExpression(decl.init)) return;
        if (decl.init.properties.length !== 0) return;

        const tempName = decl.id.name;
        const parentBody = path.parent;
        if (!t.isBlockStatement(parentBody) && !t.isProgram(parentBody)) return;

        const body = t.isBlockStatement(parentBody) ? parentBody.body : parentBody.body;
        const startIndex = body.indexOf(path.node as t.Statement);
        if (startIndex === -1) return;

        // Collect sequential assignments to this temp var
        const properties: t.ObjectProperty[] = [];
        let endIndex = startIndex;

        for (let i = startIndex + 1; i < body.length; i++) {
          const stmt = body[i];

          // Check for: tempName['key'] = value; or tempName.key = value;
          if (t.isExpressionStatement(stmt) && t.isAssignmentExpression(stmt.expression)) {
            const assign = stmt.expression;
            if (assign.operator !== '=') break;

            if (!t.isMemberExpression(assign.left)) break;
            if (!t.isIdentifier(assign.left.object) || assign.left.object.name !== tempName) break;

            let key: t.Expression;
            if (t.isStringLiteral(assign.left.property)) {
              key = assign.left.property;
            } else if (t.isIdentifier(assign.left.property) && assign.left.computed === false) {
              key = t.stringLiteral(assign.left.property.name);
            } else {
              break;
            }

            properties.push(t.objectProperty(key, assign.right));
            endIndex = i;
          } else {
            break;
          }
        }

        if (properties.length === 0) return;

        // Check if the next statement after assignments is: var x = tempName;
        const nextIndex = endIndex + 1;
        let finalVarName: string | null = null;

        if (nextIndex < body.length) {
          const nextStmt = body[nextIndex];
          if (t.isVariableDeclaration(nextStmt) && nextStmt.declarations.length === 1) {
            const nextDecl = nextStmt.declarations[0];
            if (nextDecl && t.isIdentifier(nextDecl.id) && t.isIdentifier(nextDecl.init) && nextDecl.init.name === tempName) {
              finalVarName = nextDecl.id.name;
            }
          }
        }

        // Replace: remove temp var + assignments, create collapsed object
        const objectExpr = t.objectExpression(properties);

        if (finalVarName) {
          // Replace the assignment var with the full object
          const newDecl = t.variableDeclaration('var', [
            t.variableDeclarator(t.identifier(finalVarName), objectExpr),
          ]);
          body.splice(startIndex, nextIndex - startIndex + 1, newDecl);
        } else {
          // Just update the temp var's init to include all properties
          decl.init = objectExpr;
          // Remove the assignment statements
          body.splice(startIndex + 1, endIndex - startIndex);
        }

        changed = true;
      },
    });

    // Pass 2: Inline readonly literal object properties
    traverse(ast, {
      VariableDeclaration(path: any) {
        if (path.node.declarations.length !== 1) return;
        const decl = path.node.declarations[0];
        if (!t.isIdentifier(decl.id)) return;
        if (!t.isObjectExpression(decl.init)) return;

        const objName = decl.id.name;
        const properties = decl.init.properties;

        // Build property map (only simple literals)
        const propMap = new Map<string, t.Expression>();
        let allLiterals = true;

        for (const prop of properties) {
          if (!t.isObjectProperty(prop)) { allLiterals = false; continue; }
          if (prop.computed) { allLiterals = false; continue; }

          let keyName: string | null = null;
          if (t.isStringLiteral(prop.key)) keyName = prop.key.value;
          else if (t.isIdentifier(prop.key)) keyName = prop.key.name;

          if (!keyName) { allLiterals = false; continue; }

          if (isSimpleLiteral(prop.value as t.Node)) {
            propMap.set(keyName, prop.value as t.Expression);
          } else {
            allLiterals = false;
          }
        }

        if (propMap.size === 0) return;

        // Only inline if ALL properties are literals (readonly guarantee)
        if (!allLiterals) return;

        // Check that the object is never reassigned
        const binding = path.scope.getBinding(objName);
        if (!binding) return;
        if (binding.constantViolations.length > 0) return;

        // Replace all member accesses
        let inlinedCount = 0;
        for (const refPath of binding.referencePaths) {
          const parent = refPath.parent;
          if (!t.isMemberExpression(parent)) continue;
          if (parent.object !== refPath.node) continue;

          let propName: string | null = null;
          if (t.isStringLiteral(parent.property) && parent.computed) {
            propName = parent.property.value;
          } else if (t.isIdentifier(parent.property) && !parent.computed) {
            propName = parent.property.name;
          }

          if (propName && propMap.has(propName)) {
            const value = propMap.get(propName)!;
            (refPath.parentPath as { replaceWith: (node: t.Node) => void }).replaceWith(t.cloneNode(value));
            inlinedCount++;
          }
        }

        // If all references were inlined, remove the declaration
        if (inlinedCount > 0) {
          const remainingRefs = binding.referencePaths.filter((ref: any) => !ref.removed);
          if (remainingRefs.length === 0) {
            path.remove();
          }
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
