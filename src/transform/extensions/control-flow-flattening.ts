import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import type { Binding, NodePath } from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import { definePass } from '../../pipeline/pass.js';
import type { PipelineContext } from '../../pipeline/pipeline.js';

type TraverseFn = typeof import('@babel/traverse').default;
type GenerateFn = typeof import('@babel/generator').default;

const traverse = (_traverse as unknown as { default?: TraverseFn }).default ?? (_traverse as unknown as TraverseFn);
const generate = (_generate as unknown as { default?: GenerateFn }).default ?? (_generate as unknown as GenerateFn);

type ObjectValueDescriptor =
  | { kind: 'string'; value: string }
  | { kind: 'binary'; operator: t.BinaryExpression['operator']; leftParam: string; rightParam: string }
  | { kind: 'logical'; operator: t.LogicalExpression['operator']; leftParam: string; rightParam: string }
  | { kind: 'call'; calleeParam: string; argParams: string[] };

interface ObjectCandidate {
  name: string;
  binding: Binding;
  declaratorPath: NodePath<t.VariableDeclarator>;
  properties: Map<string, ObjectValueDescriptor>;
}

function isInfiniteLoop(node: t.Statement): node is t.WhileStatement | t.ForStatement {
  if (t.isWhileStatement(node)) {
    return t.isBooleanLiteral(node.test, { value: true });
  }

  if (t.isForStatement(node)) {
    return node.init === null && node.test === null && node.update === null;
  }

  return false;
}

function getSwitchFromLoop(node: t.WhileStatement | t.ForStatement): t.SwitchStatement | null {
  if (!t.isBlockStatement(node.body) || node.body.body.length === 0) {
    return null;
  }

  const first = node.body.body[0];
  if (!t.isSwitchStatement(first)) {
    return null;
  }

  const hasBreak = node.body.body.some((statement) => t.isBreakStatement(statement));
  return hasBreak ? first : null;
}

function extractSequenceAccess(discriminant: t.Expression): { sequenceName: string; indexName: string } | null {
  if (!t.isMemberExpression(discriminant) || !discriminant.computed) {
    return null;
  }

  if (!t.isIdentifier(discriminant.object)) {
    return null;
  }

  if (!t.isUpdateExpression(discriminant.property) || discriminant.property.operator !== '++' || discriminant.property.prefix) {
    return null;
  }

  if (!t.isIdentifier(discriminant.property.argument)) {
    return null;
  }

  return {
    sequenceName: discriminant.object.name,
    indexName: discriminant.property.argument.name,
  };
}

function getSplitOrder(init: t.Expression | null | undefined): string[] | null {
  if (!init || !t.isCallExpression(init) || init.arguments.length !== 1) {
    return null;
  }

  const [arg] = init.arguments;
  if (!t.isStringLiteral(arg, { value: '|' })) {
    return null;
  }

  if (!t.isMemberExpression(init.callee) || init.callee.computed) {
    return null;
  }

  if (!t.isStringLiteral(init.callee.object) || !t.isIdentifier(init.callee.property, { name: 'split' })) {
    return null;
  }

  return init.callee.object.value.split('|');
}

function getSwitchCaseMap(statement: t.SwitchStatement): Map<string, t.Statement[]> | null {
  const caseMap = new Map<string, t.Statement[]>();

  for (const switchCase of statement.cases) {
    if (!switchCase.test || (!t.isStringLiteral(switchCase.test) && !t.isNumericLiteral(switchCase.test))) {
      return null;
    }

    const caseKey = t.isStringLiteral(switchCase.test) ? switchCase.test.value : String(switchCase.test.value);
    const body = [...switchCase.consequent];

    while (body.length > 0) {
      const tail = body[body.length - 1];
      if (t.isContinueStatement(tail) || t.isBreakStatement(tail)) {
        body.pop();
        continue;
      }
      break;
    }

    caseMap.set(caseKey, body);
  }

  return caseMap;
}

function removeDeclaratorNames(declaration: t.VariableDeclaration, names: Set<string>): void {
  declaration.declarations = declaration.declarations.filter((declarator) => {
    if (!t.isIdentifier(declarator.id)) {
      return true;
    }
    return !names.has(declarator.id.name);
  });
}

function reverseSwitchFlattening(ast: t.File): boolean {
  let changed = false;

  traverse(ast, {
    // Handle both program-level and block-level code
    'Program|BlockStatement'(path: any) {
      const body = path.node.body;

      for (let i = 0; i < body.length; i += 1) {
        const statement = body[i];
        if (!statement) {
          continue;
        }

        if (!isInfiniteLoop(statement)) {
          continue;
        }

        const switchStatement = getSwitchFromLoop(statement);
        if (!switchStatement) {
          continue;
        }

        const sequenceAccess = extractSequenceAccess(switchStatement.discriminant);
        if (!sequenceAccess) {
          continue;
        }

        let sequenceDeclIndex: number | null = null;
        let indexDeclIndex: number | null = null;
        let sequenceOrder: string[] | null = null;

        for (let j = i - 1; j >= 0; j -= 1) {
          const candidate = body[j];
          if (!t.isVariableDeclaration(candidate)) {
            break;
          }

          for (const declarator of candidate.declarations) {
            if (!t.isIdentifier(declarator.id)) {
              continue;
            }

            if (declarator.id.name === sequenceAccess.sequenceName) {
              const order = getSplitOrder(declarator.init);
              if (!order) {
                continue;
              }
              sequenceDeclIndex = j;
              sequenceOrder = order;
            }

            if (
              declarator.id.name === sequenceAccess.indexName
              && t.isNumericLiteral(declarator.init, { value: 0 })
            ) {
              indexDeclIndex = j;
            }
          }

          if (sequenceDeclIndex !== null && indexDeclIndex !== null) {
            break;
          }
        }

        if (sequenceDeclIndex === null || indexDeclIndex === null || !sequenceOrder) {
          continue;
        }

        const caseMap = getSwitchCaseMap(switchStatement);
        if (!caseMap) {
          continue;
        }

        const reorderedStatements: t.Statement[] = [];
        let validOrder = true;

        for (const key of sequenceOrder) {
          const caseBody = caseMap.get(key);
          if (!caseBody) {
            validOrder = false;
            break;
          }

          for (const caseStatement of caseBody) {
            reorderedStatements.push(t.cloneNode(caseStatement, true));
          }
        }

        if (!validOrder) {
          continue;
        }

        const indicesToProcess = Array.from(new Set([sequenceDeclIndex, indexDeclIndex])).sort((a, b) => b - a);
        const namesToRemove = new Set([sequenceAccess.sequenceName, sequenceAccess.indexName]);

        for (const declarationIndex of indicesToProcess) {
          const declaration = body[declarationIndex];
          if (!t.isVariableDeclaration(declaration)) {
            continue;
          }

          removeDeclaratorNames(declaration, namesToRemove);
          if (declaration.declarations.length === 0) {
            body.splice(declarationIndex, 1);
            if (declarationIndex < i) {
              i -= 1;
            }
          }
        }

        body.splice(i, 1, ...reorderedStatements);
        i += reorderedStatements.length - 1;
        changed = true;
      }
    },
  });

  return changed;
}

function readObjectKey(property: t.ObjectProperty): string | null {
  if (property.computed || !t.isStringLiteral(property.key) || property.key.value.length !== 5) {
    return null;
  }

  return property.key.value;
}

function parseFunctionDescriptor(fn: t.FunctionExpression | t.ArrowFunctionExpression): ObjectValueDescriptor | null {
  if (!t.isBlockStatement(fn.body) || fn.body.body.length !== 1) {
    return null;
  }

  const [onlyStatement] = fn.body.body;
  if (!t.isReturnStatement(onlyStatement) || !onlyStatement.argument) {
    return null;
  }

  const params = fn.params;
  if (!params.every((param) => t.isIdentifier(param))) {
    return null;
  }

  const paramNames = params.map((param) => param.name);
  const returnExpr = onlyStatement.argument;

  if (t.isBinaryExpression(returnExpr)) {
    if (!t.isIdentifier(returnExpr.left) || !t.isIdentifier(returnExpr.right)) {
      return null;
    }
    if (!paramNames.includes(returnExpr.left.name) || !paramNames.includes(returnExpr.right.name)) {
      return null;
    }

    return {
      kind: 'binary',
      operator: returnExpr.operator,
      leftParam: returnExpr.left.name,
      rightParam: returnExpr.right.name,
    };
  }

  if (t.isLogicalExpression(returnExpr)) {
    if (!t.isIdentifier(returnExpr.left) || !t.isIdentifier(returnExpr.right)) {
      return null;
    }
    if (!paramNames.includes(returnExpr.left.name) || !paramNames.includes(returnExpr.right.name)) {
      return null;
    }

    return {
      kind: 'logical',
      operator: returnExpr.operator,
      leftParam: returnExpr.left.name,
      rightParam: returnExpr.right.name,
    };
  }

  if (t.isCallExpression(returnExpr)) {
    if (!t.isIdentifier(returnExpr.callee) || !paramNames.includes(returnExpr.callee.name)) {
      return null;
    }
    if (!returnExpr.arguments.every((arg) => t.isIdentifier(arg) && paramNames.includes(arg.name))) {
      return null;
    }

    return {
      kind: 'call',
      calleeParam: returnExpr.callee.name,
      argParams: returnExpr.arguments.map((arg) => (arg as t.Identifier).name),
    };
  }

  return null;
}

function collectObjectCandidates(ast: t.File): Map<string, ObjectCandidate> {
  const candidates = new Map<string, ObjectCandidate>();

  traverse(ast, {
    VariableDeclarator(path) {
      if (!t.isIdentifier(path.node.id) || !t.isObjectExpression(path.node.init)) {
        return;
      }

      const name = path.node.id.name;
      const properties = new Map<string, ObjectValueDescriptor>();

      if (path.node.init.properties.length === 0) {
        return;
      }

      for (const property of path.node.init.properties) {
        if (!t.isObjectProperty(property)) {
          return;
        }

        const key = readObjectKey(property);
        if (!key) {
          return;
        }

        if (t.isStringLiteral(property.value)) {
          properties.set(key, { kind: 'string', value: property.value.value });
          continue;
        }

        if (t.isFunctionExpression(property.value) || t.isArrowFunctionExpression(property.value)) {
          const descriptor = parseFunctionDescriptor(property.value);
          if (!descriptor) {
            return;
          }
          properties.set(key, descriptor);
          continue;
        }

        return;
      }

      const binding = path.scope.getBinding(name);
      if (!binding) {
        return;
      }

      candidates.set(name, {
        name,
        binding,
        declaratorPath: path,
        properties,
      });
    },
  });

  return candidates;
}

function resolveMemberDescriptor(
  node: t.MemberExpression,
  scope: NodePath<t.Node>['scope'],
  candidates: Map<string, ObjectCandidate>,
): { candidate: ObjectCandidate; descriptor: ObjectValueDescriptor; key: string } | null {
  if (!node.computed || !t.isIdentifier(node.object) || !t.isStringLiteral(node.property)) {
    return null;
  }

  const candidate = candidates.get(node.object.name);
  if (!candidate) {
    return null;
  }

  const currentBinding = scope.getBinding(node.object.name);
  if (currentBinding !== candidate.binding) {
    return null;
  }

  const key = node.property.value;
  const descriptor = candidate.properties.get(key);
  if (!descriptor) {
    return null;
  }

  return { candidate, descriptor, key };
}

function findParamArgumentIndex(paramName: string, paramsInOrder: string[]): number {
  return paramsInOrder.findIndex((param) => param === paramName);
}

function getExpressionArg(args: Array<t.Expression | t.SpreadElement | t.ArgumentPlaceholder>, index: number): t.Expression | null {
  const arg = args[index];
  if (!arg || !t.isExpression(arg)) {
    return null;
  }
  return arg;
}

function createInlinedExpression(
  descriptor: ObjectValueDescriptor,
  callArgs: Array<t.Expression | t.SpreadElement | t.ArgumentPlaceholder>,
  paramsInOrder: string[],
): t.Expression | null {
  if (descriptor.kind === 'string') {
    return t.stringLiteral(descriptor.value);
  }

  if (descriptor.kind === 'binary' || descriptor.kind === 'logical') {
    const leftIndex = findParamArgumentIndex(descriptor.leftParam, paramsInOrder);
    const rightIndex = findParamArgumentIndex(descriptor.rightParam, paramsInOrder);
    if (leftIndex < 0 || rightIndex < 0) {
      return null;
    }

    const leftArg = getExpressionArg(callArgs, leftIndex);
    const rightArg = getExpressionArg(callArgs, rightIndex);
    if (!leftArg || !rightArg) {
      return null;
    }

    if (descriptor.kind === 'binary') {
      return t.binaryExpression(
        descriptor.operator,
        t.cloneNode(leftArg, true),
        t.cloneNode(rightArg, true),
      );
    }

    return t.logicalExpression(
      descriptor.operator,
      t.cloneNode(leftArg, true),
      t.cloneNode(rightArg, true),
    );
  }

  const calleeIndex = findParamArgumentIndex(descriptor.calleeParam, paramsInOrder);
  if (calleeIndex < 0) {
    return null;
  }

  const callee = getExpressionArg(callArgs, calleeIndex);
  if (!callee) {
    return null;
  }

  const args: t.Expression[] = [];
  for (const argParam of descriptor.argParams) {
    const argIndex = findParamArgumentIndex(argParam, paramsInOrder);
    if (argIndex < 0) {
      return null;
    }
    const argValue = getExpressionArg(callArgs, argIndex);
    if (!argValue) {
      return null;
    }
    args.push(t.cloneNode(argValue, true));
  }

  return t.callExpression(t.cloneNode(callee, true), args);
}

function hasRemainingReferences(candidate: ObjectCandidate): boolean {
  return candidate.binding.referencePaths.some((refPath) => {
    const binding = refPath.scope.getBinding(candidate.name);
    return binding === candidate.binding;
  });
}

function reverseObjectStorageFlattening(ast: t.File): boolean {
  const candidates = collectObjectCandidates(ast);
  if (candidates.size === 0) {
    return false;
  }

  let changed = false;

  traverse(ast, {
    CallExpression(path) {
      if (!path.get('callee').isMemberExpression()) {
        return;
      }

      const member = path.node.callee;
      if (!t.isMemberExpression(member)) {
        return;
      }

      const resolved = resolveMemberDescriptor(member, path.scope, candidates);
      if (!resolved) {
        return;
      }

      if (resolved.descriptor.kind === 'string') {
        return;
      }

      const objectValue = resolved.candidate.declaratorPath.node.init;
      if (!t.isObjectExpression(objectValue)) {
        return;
      }

      const prop = objectValue.properties.find((property) => {
        if (!t.isObjectProperty(property)) {
          return false;
        }
        return readObjectKey(property) === resolved.key;
      });
      if (!prop || !t.isObjectProperty(prop)) {
        return;
      }
      if (!t.isFunctionExpression(prop.value) && !t.isArrowFunctionExpression(prop.value)) {
        return;
      }
      if (!prop.value.params.every((param) => t.isIdentifier(param))) {
        return;
      }

      const paramNames = prop.value.params.map((param) => param.name);
      const inlined = createInlinedExpression(resolved.descriptor, path.node.arguments, paramNames);
      if (!inlined) {
        return;
      }

      path.replaceWith(inlined);
      changed = true;
    },

    MemberExpression(path) {
      if (
        t.isCallExpression(path.parent)
        && path.parent.callee === path.node
      ) {
        return;
      }

      const resolved = resolveMemberDescriptor(path.node, path.scope, candidates);
      if (!resolved || resolved.descriptor.kind !== 'string') {
        return;
      }

      if (
        (t.isAssignmentExpression(path.parent) && path.parent.left === path.node)
        || (t.isUpdateExpression(path.parent) && path.parent.argument === path.node)
        || (t.isUnaryExpression(path.parent, { operator: 'delete' }) && path.parent.argument === path.node)
      ) {
        return;
      }

      path.replaceWith(t.stringLiteral(resolved.descriptor.value));
      changed = true;
    },
  });

  for (const candidate of candidates.values()) {
    if (hasRemainingReferences(candidate)) {
      continue;
    }

    if (candidate.declaratorPath.removed) {
      continue;
    }

    const parentPath = candidate.declaratorPath.parentPath;
    if (parentPath.isVariableDeclaration() && parentPath.node.declarations.length === 1) {
      parentPath.remove();
    } else {
      candidate.declaratorPath.remove();
    }
    changed = true;
  }

  return changed;
}

export const controlFlowFlatteningPass = definePass({
  name: 'control-flow-flattening',

  // eslint-disable-next-line @typescript-eslint/require-await
  async transform(code: string, context: PipelineContext) {
    const ast = parse(code, { sourceType: 'unambiguous' });

    const switchChanged = reverseSwitchFlattening(ast);
    const objectChanged = reverseObjectStorageFlattening(ast);

    if ((switchChanged || objectChanged) && context.shared) {
      context.shared.passesApplied ??= [];
      context.shared.passesApplied.push('control-flow-flattening');
    }

    return generate(ast).code;
  },
});
