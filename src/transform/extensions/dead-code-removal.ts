import _traverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { parse } from '@babel/parser';
import _generate from '@babel/generator';
import { definePass } from '../../pipeline/pass.js';
import type { PipelineContext } from '../../pipeline/pipeline.js';

type TraverseFn = typeof import('@babel/traverse').default;
type GenerateFn = typeof import('@babel/generator').default;

const traverse =
  (_traverse as unknown as { default?: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn);
const generate =
  (_generate as unknown as { default?: GenerateFn }).default ??
  (_generate as unknown as GenerateFn);

/**
 * Dead Code Removal Pass
 * Removes javascript-obfuscator dead code branches for string literal comparisons.
 */
export const deadCodeRemovalPass = definePass({
  name: 'dead-code-removal',

  // eslint-disable-next-line @typescript-eslint/require-await
  async transform(code: string, context: PipelineContext) {
    const ast = parse(code, { sourceType: 'unambiguous' });
    let replacements = 0;

    traverse(ast, {
      IfStatement(path: NodePath<t.IfStatement>) {
        const { test, consequent, alternate } = path.node;

        if (!t.isBinaryExpression(test)) {
          return;
        }

        if (
          test.operator !== '===' &&
          test.operator !== '!==' &&
          test.operator !== '==' &&
          test.operator !== '!='
        ) {
          return;
        }

        if (!t.isStringLiteral(test.left) || !t.isStringLiteral(test.right)) {
          return;
        }

        const leftValue = test.left.value;
        const rightValue = test.right.value;
        const isEqual = leftValue === rightValue;

        const testResult =
          test.operator === '===' || test.operator === '==' ? isEqual : !isEqual;

        const keptBranch = testResult ? consequent : alternate;

        if (!keptBranch) {
          path.remove();
          replacements++;
          return;
        }

        if (t.isBlockStatement(keptBranch)) {
          path.replaceWithMultiple(keptBranch.body);
          replacements++;
          return;
        }

        path.replaceWith(keptBranch);
        replacements++;
      },
    });

    if (context.shared) {
      context.shared.passesApplied ??= [];
      context.shared.passesApplied.push(`dead-code-removal:${replacements}`);
    }

    return generate(ast).code;
  },
});
