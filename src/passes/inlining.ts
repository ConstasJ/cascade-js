import traverseDefault from '@babel/traverse';
import * as t from '@babel/types';
import type { ASTPass, PipelineContext } from '../types.js';

const traverse = typeof traverseDefault === 'function' ? traverseDefault : (traverseDefault as any).default;

interface FunctionInfo {
  node: t.FunctionDeclaration | t.VariableDeclarator;
  id: string;
  paramNames: string[];
  body: t.BlockStatement | t.Expression;
  callCount: number;
  bodySize: number;
  isPure: boolean;
  declarationPath?: any;
}

/**
 * Simple purity check for expressions
 * Returns true if the expression has no observable side effects
 */
function isPureExpression(node: t.Node): boolean {
  // Literals are always pure
  if (t.isLiteral(node)) return true;
  
  // Identifiers are pure (reading a variable)
  if (t.isIdentifier(node)) return true;
  
  // Binary operations are pure if operands are pure
  if (t.isBinaryExpression(node)) {
    return isPureExpression(node.left) && isPureExpression(node.right);
  }
  
  // Unary operations are pure if argument is pure (except delete)
  if (t.isUnaryExpression(node) && node.operator !== 'delete') {
    return isPureExpression(node.argument);
  }
  
  // Logical expressions are pure if operands are pure
  if (t.isLogicalExpression(node)) {
    return isPureExpression(node.left) && isPureExpression(node.right);
  }
  
  // Conditional expressions are pure if all branches are pure
  if (t.isConditionalExpression(node)) {
    return isPureExpression(node.test) && 
           isPureExpression(node.consequent) && 
           isPureExpression(node.alternate);
  }
  
  // Array expressions are pure if all elements are pure
  if (t.isArrayExpression(node)) {
    return node.elements.every(el => el === null || isPureExpression(el));
  }
  
  // Default to impure for safety
  return false;
}

/**
 * Count statements in a function body
 */
function countStatements(body: t.BlockStatement | t.Expression): number {
  if (t.isBlockStatement(body)) {
    return body.body.length;
  }
  // Arrow function with expression body counts as 1
  return 1;
}

/**
 * Check if function body is pure (no side effects)
 */
function isFunctionBodyPure(body: t.BlockStatement | t.Expression): boolean {
  if (t.isExpression(body)) {
    return isPureExpression(body);
  }
  
  if (t.isBlockStatement(body)) {
    // Check each statement
    for (const stmt of body.body) {
      if (t.isReturnStatement(stmt)) {
        if (stmt.argument && !isPureExpression(stmt.argument)) {
          return false;
        }
      } else if (t.isExpressionStatement(stmt)) {
        if (!isPureExpression(stmt.expression)) {
          return false;
        }
      } else {
        // Variable declarations, etc. - be conservative
        return false;
      }
    }
    return true;
  }
  
  return false;
}

export const inliningPass: ASTPass = {
  name: 'inlining',
  dependencies: ['constant-propagation'],
  transform(ast, context: PipelineContext) {
    const functions = new Map<string, FunctionInfo>();
    const callSites = new Map<string, any[]>();
    let inlinedCount = 0;
    
    // First pass: collect function definitions
    traverse(ast, {
      FunctionDeclaration(path: any) {
        const { id, params, body } = path.node;
        if (!id) return;
        
        // Only inline if all parameters are identifiers
        const paramNames = params
          .filter((p: any): p is t.Identifier => t.isIdentifier(p))
          .map((p: t.Identifier) => p.name);
        
        if (paramNames.length !== params.length) return;
        
        const bodySize = countStatements(body);
        const isPure = isFunctionBodyPure(body);
        
        functions.set(id.name, {
          node: path.node,
          id: id.name,
          paramNames,
          body,
          callCount: 0,
          bodySize,
          isPure,
          declarationPath: path,
        });
        
        callSites.set(id.name, []);
      },
      
      // Also handle arrow functions and function expressions assigned to variables
      VariableDeclarator(path: any) {
        const { id, init } = path.node;
        if (!t.isIdentifier(id)) return;
        
        let funcNode: t.FunctionExpression | t.ArrowFunctionExpression | null = null;
        
        if (t.isFunctionExpression(init)) {
          funcNode = init;
        } else if (t.isArrowFunctionExpression(init)) {
          funcNode = init;
        } else {
          return;
        }
        
        const { params, body } = funcNode;
        
        // Only inline if all parameters are identifiers
        const paramNames = params
          .filter((p: any): p is t.Identifier => t.isIdentifier(p))
          .map((p: t.Identifier) => p.name);
        
        if (paramNames.length !== params.length) return;
        
        const bodySize = countStatements(
          t.isBlockStatement(body) ? body : body as t.Expression
        );
        const isPure = isFunctionBodyPure(
          t.isBlockStatement(body) ? body : body as t.Expression
        );
        
        functions.set(id.name, {
          node: path.node,
          id: id.name,
          paramNames,
          body: t.isBlockStatement(body) ? body : body as t.Expression,
          callCount: 0,
          bodySize,
          isPure,
          declarationPath: path.parentPath, // VariableDeclaration
        });
        
        callSites.set(id.name, []);
      },
    });

    // Second pass: count call sites
    traverse(ast, {
      CallExpression(path: any) {
        const { callee } = path.node;
        if (t.isIdentifier(callee) && functions.has(callee.name)) {
          const calls = callSites.get(callee.name) || [];
          calls.push(path);
          callSites.set(callee.name, calls);
          
          const info = functions.get(callee.name)!;
          info.callCount++;
        }
      },
    });

    // Third pass: inline eligible functions
    for (const [name, info] of functions) {
      const calls = callSites.get(name) || [];
      
      // Inline if:
      // 1. Only called once
      // 2. Body size <= 3 statements
      // 3. Body is pure (no side effects)
      if (
        info.callCount === 1 && 
        calls.length === 1 && 
        info.bodySize <= 3 && 
        info.isPure
      ) {
        const callPath = calls[0];
        const callArgs = callPath.node.arguments;
        
        // Only inline if arguments match parameter count and are simple
        if (callArgs.length === info.paramNames.length) {
          const allArgsSimple = callArgs.every((arg: t.Node) => 
            t.isLiteral(arg) || t.isIdentifier(arg)
          );
          
          if (allArgsSimple) {
            // Create parameter substitution map
            const substitutions = new Map<string, t.Expression>();
            for (let i = 0; i < info.paramNames.length; i++) {
              const arg = callArgs[i];
              const paramName = info.paramNames[i];
              if (t.isExpression(arg) && paramName) {
                substitutions.set(paramName, arg);
              }
            }
            
            // Inline the function body
            let inlinedExpr: t.Expression | null = null;
            
            if (t.isExpression(info.body)) {
              // Arrow function with expression body
              inlinedExpr = t.cloneDeep(info.body);
            } else if (t.isBlockStatement(info.body)) {
              // Function with block body - extract return value
              const returnStmt = info.body.body.find(stmt => t.isReturnStatement(stmt));
              if (returnStmt && t.isReturnStatement(returnStmt) && returnStmt.argument) {
                inlinedExpr = t.cloneDeep(returnStmt.argument);
              }
            }
            
            if (inlinedExpr) {
              // Substitute parameters with arguments
              traverse(
                t.file(t.program([t.expressionStatement(inlinedExpr)])),
                {
                  Identifier(substPath: any) {
                    if (substPath.isReferencedIdentifier()) {
                      const replacement = substitutions.get(substPath.node.name);
                      if (replacement) {
                        substPath.replaceWith(t.cloneNode(replacement));
                      }
                    }
                  },
                },
                callPath.scope
              );
              
              // Replace call with inlined expression
              callPath.replaceWith(inlinedExpr);
              
              // Remove function declaration
              if (info.declarationPath) {
                info.declarationPath.remove();
              }
              
              inlinedCount++;
            }
          }
        }
      }
    }

    // Update stats
    if (inlinedCount > 0) {
      context.stats.passesApplied.push('inlining');
      context.logger.debug(`Inlined ${inlinedCount} function(s)`);
    }

    return ast;
  },
};
