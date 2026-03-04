import traverseDefault from '@babel/traverse';
import * as t from '@babel/types';
import type { Pass, PipelineContext } from '../types.js';



const traverse = typeof traverseDefault === 'function' ? traverseDefault : (traverseDefault as any).default;

export const cleanupPass: Pass = {
  name: 'cleanup',
  dependencies: ['string-replacement', 'inlining'],
  
  transform(ast, context: PipelineContext) {
    let removedCount = 0;
    
    traverse(ast, {
      // Remove unused variable declarations
      VariableDeclaration(path: any) {
        const { declarations } = path.node;
        const usedDeclarations = declarations.filter((decl: any) => {
          if (!t.isIdentifier(decl.id)) return true;
          
          const name = decl.id.name;
          let isUsed = false;
          
          // Check if variable is referenced elsewhere
          const binding = path.scope.getBinding(name);
          if (binding) {
            isUsed = binding.referencePaths.length > 0;
          }
          
          return isUsed;
        });
        
        if (usedDeclarations.length === 0) {
          path.remove();
          removedCount++;
        } else if (usedDeclarations.length < declarations.length) {
          path.node.declarations = usedDeclarations;
          removedCount += declarations.length - usedDeclarations.length;
        }
      },
      
      // Remove dead code blocks (if (false) { ... })
      IfStatement(path: any) {
        const { test } = path.node;
        
        if (t.isBooleanLiteral(test)) {
          if (test.value === false) {
            // Remove the if statement entirely
            path.remove();
            removedCount++;
          }
          // if (true) could be handled here too
        }
      },
      
      // Remove empty functions
      FunctionDeclaration(path: any) {
        if (t.isBlockStatement(path.node.body) && 
            path.node.body.body.length === 0) {
          path.remove();
          removedCount++;
        }
      },
    });
    
    if (removedCount > 0) {
      context.stats.passesApplied.push('cleanup');
    }
    
    return ast;
  },
};
