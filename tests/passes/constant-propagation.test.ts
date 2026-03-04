import { describe, it, expect } from 'vitest';
import { constantPropagationPass } from '../../src/passes/constant-propagation.js';
import type { PipelineContext } from '../../src/pipeline/pipeline.js';

function createMockContext(): PipelineContext {
  return {
    shared: {},
  };
}

describe('Constant Propagation Pass', () => {
  it('propagates number constants', async () => {
    const code = 'var x = 5; console.log(x);';
    const context = createMockContext();
    
    const result = await constantPropagationPass.transform(code, context);
    
    expect(result).toContain('console.log(5)');
    expect(context.shared.recoveredLiterals).toBe(1);
  });

  it('propagates string constants', async () => {
    const code = `var msg = 'hello'; console.log(msg);`;
    const context = createMockContext();
    
    const result = await constantPropagationPass.transform(code, context);
    
    expect(result).toContain("console.log('hello')");
  });

  it('propagates boolean constants', async () => {
    const code = 'var flag = true; if (flag) console.log("yes");';
    const context = createMockContext();
    
    const result = await constantPropagationPass.transform(code, context);
    
    expect(result).toContain('if (true)');
  });

  it('does not propagate reassigned variables', async () => {
    const code = 'var x = 5; x = 10; console.log(x);';
    const context = createMockContext();
    
    const result = await constantPropagationPass.transform(code, context);
    
    // Should still have 'x' in the output
    expect(result).toContain('console.log(x)');
  });

  it('propagates multiple constants', async () => {
    const code = `
      var a = 1;
      var b = 2;
      var c = a + b;
    `;
    const context = createMockContext();
    
    const result = await constantPropagationPass.transform(code, context);
    
    expect(result).toContain('var c = 1 + 2');
    expect(context.shared.recoveredLiterals).toBe(2); // a and b
  });
});
