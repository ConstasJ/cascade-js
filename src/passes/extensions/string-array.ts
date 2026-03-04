/**
 * String Array AST Detection Pass
 *
 * Pure AST pattern matching to detect and extract the string array
 * used by javascript-obfuscator. Works WITHOUT LLM dependency.
 *
 * Detects patterns:
 * 1. String array function: function _0xabcd() { const arr = [...]; _0xabcd = function() { return arr; }; return _0xabcd(); }
 * 2. Simple array variable: var _0xabcd = ["str1", "str2", ...]
 *
 * After detection, extracts the array contents for use by downstream passes.
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
 * Detected string array info
 */
export interface StringArrayDetection {
  /** Name of the string array function/variable */
  arrayName: string;
  /** The raw string values in order */
  strings: string[];
  /** AST node paths to remove after extraction */
  nodeIndices: number[];
}

/**
 * Check if identifier name matches obfuscator hex pattern (_0x[a-f0-9]{4,6})
 */
function isHexIdentifier(name: string): boolean {
  return /^_0x[a-f0-9]{4,6}$/.test(name);
}

/**
 * Detect the self-replacing string array function pattern:
 *
 * function _0xabcd() {
 *   const arr = ["str1", "str2", ...];
 *   _0xabcd = function() { return arr; };
 *   return _0xabcd();
 * }
 */
function detectStringArrayFunction(ast: t.File): StringArrayDetection | null {
  let result: StringArrayDetection | null = null;

  traverse(ast, {
    FunctionDeclaration(path: any) {
      if (result) return;
      const funcName = path.node.id?.name;
      if (!funcName) return;

      const body = path.node.body.body;
      if (body.length < 2 || body.length > 4) return;

      // Look for: const/var/let arr = ["str1", "str2", ...]
      let arrayElements: string[] | null = null;

      for (const stmt of body) {
        if (t.isVariableDeclaration(stmt)) {
          for (const decl of stmt.declarations) {
            if (t.isArrayExpression(decl.init)) {
              const elements = decl.init.elements;
              if (elements.length > 5 && elements.every(el => t.isStringLiteral(el))) {
                arrayElements = elements.map(el => (el as t.StringLiteral).value);
              }
            }
          }
        }
      }

      if (!arrayElements) return;

      // Verify self-reassignment pattern: funcName = function() { return arr; }
      let hasSelfReassignment = false;
      for (const stmt of body) {
        if (t.isExpressionStatement(stmt) && t.isAssignmentExpression(stmt.expression)) {
          const left = stmt.expression.left;
          if (t.isIdentifier(left) && left.name === funcName) {
            hasSelfReassignment = true;
          }
        }
      }

      if (!hasSelfReassignment) return;

      // Find the index of this function in the program body
      const programBody = ast.program.body;
      const nodeIndex = programBody.indexOf(path.node as t.Statement);

      result = {
        arrayName: funcName,
        strings: arrayElements,
        nodeIndices: nodeIndex >= 0 ? [nodeIndex] : [],
      };
    },
  });

  return result;
}

/**
 * Detect simple array variable pattern:
 *
 * var _0xabcd = ["str1", "str2", ...];
 */
function detectStringArrayVariable(ast: t.File): StringArrayDetection | null {
  let result: StringArrayDetection | null = null;

  traverse(ast, {
    VariableDeclaration(path: any) {
      if (result) return;
      // Only match top-level declarations
      if (!t.isProgram(path.parent)) return;

      for (const decl of path.node.declarations) {
        if (!t.isIdentifier(decl.id)) continue;
        if (!t.isArrayExpression(decl.init)) continue;

        const elements = decl.init.elements;
        // String arrays are typically large (>5 elements)
        if (elements.length <= 5) continue;
        if (!elements.every((el: any) => t.isStringLiteral(el))) continue;

        const programBody = ast.program.body;
        const nodeIndex = programBody.indexOf(path.node);

        result = {
          arrayName: decl.id.name,
          strings: elements.map((el: any) => (el as t.StringLiteral).value),
          nodeIndices: nodeIndex >= 0 ? [nodeIndex] : [],
        };
        break;
      }
    },
  });

  return result;
}

/**
 * Detect the string fetcher/decoder function pattern:
 *
 * function _0x5678(index, key) {
 *   index = index - 0x100;  // index shift
 *   const arr = _0xabcd();   // call to string array
 *   return arr[index];
 * }
 *
 * Also detects Base64/RC4 variants that have initialization blocks.
 */
export interface DecoderDetection {
  /** Name of the decoder function */
  decoderName: string;
  /** Index shift value (subtracted from argument) */
  indexShift: number;
  /** Name of the string array being referenced */
  arrayRef: string;
  /** Encoding type detected */
  encoding: 'none' | 'base64' | 'rc4';
  /** Index of the node in program body */
  nodeIndex: number;
}

function detectDecoderFunction(ast: t.File, stringArrayName: string): DecoderDetection | null {
  let result: DecoderDetection | null = null;

  traverse(ast, {
    FunctionDeclaration(path: any) {
      if (result) return;
      const funcName = path.node.id?.name;
      if (!funcName || funcName === stringArrayName) return;

      // Check if function body references the string array
      let referencesArray = false;
      let indexShift = 0;
      let encoding: 'none' | 'base64' | 'rc4' = 'none';

      path.traverse({
        CallExpression(innerPath: any) {
          if (t.isIdentifier(innerPath.node.callee) && innerPath.node.callee.name === stringArrayName) {
            referencesArray = true;
          }
        },
        // Detect index shift: param = param - 0x100
        AssignmentExpression(innerPath: any) {
          if (t.isIdentifier(innerPath.node.left) && t.isBinaryExpression(innerPath.node.right)) {
            const right = innerPath.node.right;
            if (right.operator === '-' && t.isNumericLiteral(right.right)) {
              indexShift = right.right.value;
            } else if (right.operator === '+' && t.isUnaryExpression(right.right) &&
              right.right.operator === '-' && t.isNumericLiteral(right.right.argument)) {
              indexShift = right.right.argument.value;
            }
          }
        },
        // Detect encoding by looking for atob (base64) or RC4 patterns
        Identifier(innerPath: any) {
          if (innerPath.node.name === 'atob') {
            encoding = 'base64';
          }
        },
        // RC4: look for charCodeAt + key iteration patterns
        MemberExpression(innerPath: any) {
          if (t.isIdentifier(innerPath.node.property) && innerPath.node.property.name === 'charCodeAt') {
            if (encoding !== 'base64') {
              encoding = 'rc4';
            }
          }
        },
      });

      if (!referencesArray) return;

      const programBody = ast.program.body;
      const nodeIndex = programBody.indexOf(path.node as t.Statement);

      result = {
        decoderName: funcName,
        indexShift,
        arrayRef: stringArrayName,
        encoding,
        nodeIndex,
      };
    },
  });

  return result;
}

/**
 * Detect the rotate/shuffle IIFE pattern:
 *
 * (function(_0xarray, _0xrotate) {
 *   var _0xpush = _0xarray();
 *   while (true) {
 *     try {
 *       var _0xval = parseInt(...) / ... + ...;
 *       if (_0xval === _0xrotate) break;
 *       else _0xpush['push'](_0xpush['shift']());
 *     } catch (e) {
 *       _0xpush['push'](_0xpush['shift']());
 *     }
 *   }
 * })(_0xabcd, 0x12345);
 */
export interface RotateDetection {
  /** The target rotation value */
  targetValue: number;
  /** Name of the string array function being rotated */
  arrayRef: string;
  /** Index of the IIFE node in program body */
  nodeIndex: number;
}

function detectRotateFunction(ast: t.File, stringArrayName: string): RotateDetection | null {
  let result: RotateDetection | null = null;

  const programBody = ast.program.body;

  for (let i = 0; i < programBody.length; i++) {
    const stmt = programBody[i];
    if (!t.isExpressionStatement(stmt)) continue;

    const expr = stmt.expression;
    if (!t.isCallExpression(expr)) continue;

    const callee = expr.callee;
    if (!t.isFunctionExpression(callee) && !t.isArrowFunctionExpression(callee)) continue;

    // Check arguments: should reference stringArrayName and have a numeric target
    const args = expr.arguments;
    if (args.length < 2) continue;

    const firstArg = args[0];
    if (!t.isIdentifier(firstArg) || firstArg.name !== stringArrayName) continue;

    const secondArg = args[1];
    let targetValue: number | null = null;
    if (t.isNumericLiteral(secondArg)) {
      targetValue = secondArg.value;
    }
    // Sometimes the target is a negative unary expression
    if (t.isUnaryExpression(secondArg) && secondArg.operator === '-' && t.isNumericLiteral(secondArg.argument)) {
      targetValue = -secondArg.argument.value;
    }

    if (targetValue === null) continue;

    // Verify the IIFE body contains push/shift pattern (rotation)
    let hasPushShift = false;
    const funcBody = t.isBlockStatement(callee.body) ? callee.body : null;
    if (!funcBody) continue;

    const funcCode = generate(callee).code;
    if (funcCode.includes('push') && funcCode.includes('shift')) {
      hasPushShift = true;
    }

    if (!hasPushShift) continue;

    result = {
      targetValue,
      arrayRef: stringArrayName,
      nodeIndex: i,
    };
    break;
  }

  return result;
}

/**
 * Detect decoder wrapper functions/variables:
 *
 * var _0xwrap = _0xdecoder;
 * function _0xwrap(a, b) { return _0xdecoder(a - offset, b); }
 */
export interface WrapperDetection {
  wrapperName: string;
  decoderRef: string;
  type: 'variable' | 'function';
  indexOffset: number;
  nodeIndex: number;
}

function detectDecoderWrappers(ast: t.File, decoderName: string): WrapperDetection[] {
  const wrappers: WrapperDetection[] = [];
  const programBody = ast.program.body;

  for (let i = 0; i < programBody.length; i++) {
    const stmt = programBody[i];

    // Variable alias: var _0xwrap = _0xdecoder;
    if (t.isVariableDeclaration(stmt)) {
      for (const decl of stmt.declarations) {
        if (t.isIdentifier(decl.id) && t.isIdentifier(decl.init) && decl.init.name === decoderName) {
          wrappers.push({
            wrapperName: decl.id.name,
            decoderRef: decoderName,
            type: 'variable',
            indexOffset: 0,
            nodeIndex: i,
          });
        }
      }
    }

    // Function wrapper: function _0xwrap(a, b) { return _0xdecoder(a - offset, b); }
    if (t.isFunctionDeclaration(stmt) && stmt.id) {
      const funcName = stmt.id.name;
      if (funcName === decoderName) continue;

      const body = stmt.body.body;
      if (body.length !== 1) continue;

      const retStmt = body[0];
      if (!t.isReturnStatement(retStmt)) continue;
      if (!t.isCallExpression(retStmt.argument)) continue;

      const callExpr = retStmt.argument;
      if (!t.isIdentifier(callExpr.callee) || callExpr.callee.name !== decoderName) continue;

      // Check for index offset in first argument
      let indexOffset = 0;
      const firstArg = callExpr.arguments[0];
      if (t.isBinaryExpression(firstArg)) {
        if (firstArg.operator === '-' && t.isNumericLiteral(firstArg.right)) {
          indexOffset = -firstArg.right.value;
        } else if (firstArg.operator === '+' && t.isNumericLiteral(firstArg.right)) {
          indexOffset = firstArg.right.value;
        }
      }

      wrappers.push({
        wrapperName: funcName,
        decoderRef: decoderName,
        type: 'function',
        indexOffset,
        nodeIndex: i,
      });
    }
  }

  return wrappers;
}

/**
 * Main string array deobfuscation pass.
 *
 * Pipeline:
 * 1. Detect string array (function or variable pattern)
 * 2. Detect rotate/shuffle IIFE
 * 3. Detect decoder function (with encoding + index shift)
 * 4. Detect decoder wrappers (aliases + function wrappers)
 * 5. Execute string array + rotate in sandbox to get final array
 * 6. Replace all decoder/wrapper calls with resolved string literals
 * 7. Remove string array infrastructure nodes
 */
export const stringArrayPass = definePass({
  name: 'string-array',
  async transform(code: string, context: PipelineContext) {
    const ast = parse(code, { sourceType: 'unambiguous' });

    // Step 1: Detect string array
    let detection = detectStringArrayFunction(ast);
    if (!detection) {
      detection = detectStringArrayVariable(ast);
    }
    if (!detection) {
      return code; // No string array found
    }

    // Step 2: Detect rotate function
    const rotate = detectRotateFunction(ast, detection.arrayName);

    // Step 3: Detect decoder function
    const decoder = detectDecoderFunction(ast, detection.arrayName);

    // Step 4: Detect decoder wrappers
    const wrappers = decoder ? detectDecoderWrappers(ast, decoder.decoderName) : [];

    // Step 5: Build the final string array
    // If there's a rotate function, we need to execute in sandbox
    let strings = detection.strings;

    if (rotate) {
      try {
        // Dynamic import to avoid circular deps
        const { extractStringsFromPrelude } = await import('../../sandbox/executor.js');

        // Build prelude code for sandbox execution
        const programBody = ast.program.body;
        const preludeNodes: t.Statement[] = [];

        // Add string array function/variable
        for (const idx of detection.nodeIndices) {
          const preludeNode = programBody[idx];
          if (preludeNode) preludeNodes.push(preludeNode);
        }
        // Add rotate IIFE
        const rotateNode = programBody[rotate.nodeIndex];
        if (rotateNode) preludeNodes.push(rotateNode);

        const preludeCode = preludeNodes.map(node => generate(node).code).join('\n');
        const sandboxResult = await extractStringsFromPrelude(preludeCode, detection.arrayName);

        if (sandboxResult.strings.size > 0) {
          // Convert sandbox result (Map<number, string>) to ordered array
          const maxIndex = Math.max(...sandboxResult.strings.keys());
          strings = [];
          for (let j = 0; j <= maxIndex; j++) {
            strings.push(sandboxResult.strings.get(j) ?? '');
          }
        }
      } catch {
        // Sandbox failed, fall back to static array (pre-rotation)
      }
    }

    // Step 6: Build lookup function that resolves indices to strings
    const indexShift = decoder?.indexShift ?? 0;
    const allDecoderNames = new Set<string>();
    if (decoder) allDecoderNames.add(decoder.decoderName);
    for (const w of wrappers) allDecoderNames.add(w.wrapperName);

    // If no decoder found, the array might be accessed directly
    if (!decoder) {
      allDecoderNames.add(detection.arrayName);
    }

    // Build wrapper offset map
    const wrapperOffsets = new Map<string, number>();
    for (const w of wrappers) {
      wrapperOffsets.set(w.wrapperName, w.indexOffset);
    }

    let replacedCount = 0;

    // Replace all calls to decoder/wrappers with string literals
    traverse(ast, {
      CallExpression(path: any) {
        if (!t.isIdentifier(path.node.callee)) return;
        const calleeName = path.node.callee.name;
        if (!allDecoderNames.has(calleeName)) return;

        // Get the index argument
        const firstArg = path.node.arguments[0];
        let index: number | null = null;

        if (t.isNumericLiteral(firstArg)) {
          index = firstArg.value;
        } else if (t.isStringLiteral(firstArg)) {
          // Sometimes indices are hex strings: '0x1a'
          const parsed = parseInt(firstArg.value, 16);
          if (!isNaN(parsed)) index = parsed;
        } else if (t.isUnaryExpression(firstArg) && firstArg.operator === '-' && t.isNumericLiteral(firstArg.argument)) {
          index = -firstArg.argument.value;
        }

        if (index === null) return;

        // Apply index shift and wrapper offset
        let effectiveIndex = index - indexShift;

        const wrapperOffset = wrapperOffsets.get(calleeName);
        if (wrapperOffset !== undefined) {
          effectiveIndex = index + wrapperOffset - indexShift;
        }

        // Direct array access (no decoder)
        if (!decoder && calleeName === detection!.arrayName) {
          effectiveIndex = index;
        }

        if (effectiveIndex >= 0 && effectiveIndex < strings.length) {
          const resolved = strings[effectiveIndex];
          if (resolved !== undefined) {
            path.replaceWith(t.stringLiteral(resolved));
            replacedCount++;
          }
        }
      },
      // Also replace member access: _0xarray[0], _0xarray[1]
      MemberExpression(path: any) {
        if (!t.isIdentifier(path.node.object)) return;
        if (path.node.object.name !== detection!.arrayName) return;
        if (!t.isNumericLiteral(path.node.property)) return;

        const index = path.node.property.value;
        if (index >= 0 && index < strings.length) {
          const resolved = strings[index];
          if (resolved !== undefined) {
            path.replaceWith(t.stringLiteral(resolved));
            replacedCount++;
          }
        }
      },
    });

    // Step 7: Remove string array infrastructure
    const indicesToRemove = new Set<number>();
    for (const idx of detection.nodeIndices) indicesToRemove.add(idx);
    if (rotate) indicesToRemove.add(rotate.nodeIndex);
    if (decoder) indicesToRemove.add(decoder.nodeIndex);
    for (const w of wrappers) indicesToRemove.add(w.nodeIndex);

    // Remove in reverse order to preserve indices
    const sortedIndices = [...indicesToRemove].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      if (idx >= 0 && idx < ast.program.body.length) {
        ast.program.body.splice(idx, 1);
      }
    }

    // Store in context for downstream passes
    if (context.shared) {
      context.shared.stringArrayDetected = true;
      context.shared.stringArrayStrings = strings;
      context.shared.stringReplacementCount = replacedCount;
    }

    const output = generate(ast, { retainLines: false }).code;
    return output;
  },
});
