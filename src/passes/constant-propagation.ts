import traverseDefault from '@babel/traverse';
import * as t from '@babel/types';
import { parse } from '@babel/parser';
import generateDefault from '@babel/generator';
import { definePass } from '../pipeline/pass.js';
import type { PipelineContext } from '../pipeline/pipeline.js';

// Handle both ESM and CJS imports
const traverse = typeof traverseDefault === 'function' ? traverseDefault : (traverseDefault as any).default;
const generate = typeof generateDefault === 'function' ? generateDefault : (generateDefault as any).default;

interface ConstantValue {
  value: unknown;
  node: t.Expression;
}

export const constantPropagationPass = definePass({
  name: 'constant-propagation',
  
  async transform(code: string, context: PipelineContext) {
    const constants = new Map<string, ConstantValue>();
    const reassigned = new Set<string>();
    
    // Parse code to AST
    const ast = parse(code, { sourceType: 'script' });
    
    // First pass: collect constant declarations and track reassignments
    traverse(ast, {
      VariableDeclarator(path: any) {
        const { id, init } = path.node;
        
        // Only handle simple identifiers with literal values
        if (!t.isIdentifier(id) || !init) return;
        
        // Check if init is a literal
        if (t.isLiteral(init)) {
          let value: unknown;
          
          if (t.isStringLiteral(init)) {
            value = init.value;
          } else if (t.isNumericLiteral(init)) {
            value = init.value;
          } else if (t.isBooleanLiteral(init)) {
            value = init.value;
          } else if (t.isNullLiteral(init)) {
            value = null;
          } else {
            // Don't track other literal types
            return;
          }
          
          constants.set(id.name, { value, node: init });
        }
      },
      
      AssignmentExpression(path: any) {
        // Track reassignments
        if (t.isIdentifier(path.node.left)) {
          reassigned.add(path.node.left.name);
        }
      },
    });

    // Remove reassigned variables from constants
    for (const name of reassigned) {
      constants.delete(name);
    }

    // Second pass: replace constant usages
    if (constants.size > 0) {
      traverse(ast, {
        Identifier(path: any) {
          // Don't replace declarations or property keys
          if (path.isReferencedIdentifier()) {
            const constant = constants.get(path.node.name);
            if (constant) {
              // Replace with the literal value
              path.replaceWith(t.cloneNode(constant.node));
            }
          }
        },
      });
    }

    // Store stats in shared context if available
    if (constants.size > 0 && context.shared) {
      context.shared.recoveredLiterals = (context.shared.recoveredLiterals || 0) + constants.size;
      if (!context.shared.passesApplied) {
        context.shared.passesApplied = [];
      }
      context.shared.passesApplied.push('constant-propagation');
    }

    // Generate code from AST
    return generate(ast).code;
  },
});
