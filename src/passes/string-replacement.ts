import { parse } from '@babel/parser';
import traverseDefault from '@babel/traverse';
import * as t from '@babel/types';
import generateDefault from '@babel/generator';
import { definePass } from '../pipeline/pass.js';
import type { PipelineContext } from '../pipeline/pipeline.js';

// Handle both ESM and CJS imports
const traverse = typeof traverseDefault === 'function' ? traverseDefault : (traverseDefault as any).default;
const generate = typeof generateDefault === 'function' ? generateDefault : (generateDefault as any).default;

/**
 * String Replacement Pass
 * 
 * Replaces decoded strings in the AST that were recovered from the prelude.
 * Looks for patterns like:
 * - _0x1234(0x1e4) -> 'decoded string' (function calls)
 * - _0x1234[0] -> 'decoded string' (array member access)
 * - _0x1234(0x1e4 - 0x1e4) -> 'decoded string' (computed index)
 */
export const stringReplacementPass = definePass({
  name: 'string-replacement',
  dependencies: ['constant-propagation'],
  
  // eslint-disable-next-line @typescript-eslint/require-await
  async transform(code: string, context: PipelineContext) {
    // Get recovered strings from context
    const recoveredStrings = context.shared.recoveredStrings as Map<number, string> | undefined;
    
    if (!recoveredStrings || recoveredStrings.size === 0) {
      return code;
    }
    
    // Parse code to AST
    const ast = parse(code, { sourceType: 'script' });
    
    let replacedCount = 0;
    
    traverse(ast, {
      // Replace string array accesses: _0x1234(0x1e4) -> 'decoded string'
      CallExpression(path: any) {
        const { callee, arguments: args } = path.node;
        
        // Check if this is a string fetcher call
        if (t.isIdentifier(callee) && args.length > 0) {
          const indexArg = args[0];
          
          // Try to resolve the index
          let index: number | null = null;
          if (t.isNumericLiteral(indexArg)) {
            index = indexArg.value;
          } else if (t.isBinaryExpression(indexArg) && 
                     t.isNumericLiteral(indexArg.left) &&
                     t.isNumericLiteral(indexArg.right) &&
                     indexArg.operator === '-') {
            // Handle: _0x1234(0x1e4 - 0x1e4) pattern
            index = indexArg.left.value - indexArg.right.value;
          }
          
          if (index !== null && recoveredStrings.has(index)) {
            const decodedString = recoveredStrings.get(index)!;
            path.replaceWith(t.stringLiteral(decodedString));
            replacedCount++;
          }
        }
      },
      
      // Replace array member accesses: _0x1234[0] -> 'decoded string'
      MemberExpression(path: any) {
        const { object, property, computed } = path.node;
        
        if (t.isIdentifier(object)) {
          let index: number | null = null;
          
          // Handle computed member access: arr[0]
          if (computed && t.isNumericLiteral(property)) {
            index = property.value;
          }
          // Handle non-computed but numeric: arr.0 (rare but possible in AST)
          else if (!computed && t.isNumericLiteral(property)) {
            index = property.value;
          }
          
          if (index !== null && recoveredStrings.has(index)) {
            const decodedString = recoveredStrings.get(index)!;
            path.replaceWith(t.stringLiteral(decodedString));
            replacedCount++;
          }
        }
      },
    });
    
    // Generate code from modified AST
    const output = generate(ast, {
      retainLines: false,
      compact: false,
    });
    
    // Update context stats if replacements were made
    if (replacedCount > 0) {
      context.shared.stringReplacements = replacedCount;
    }
    
    return output.code;
  },
});
