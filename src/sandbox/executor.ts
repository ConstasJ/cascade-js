import { getQuickJS, type QuickJSWASMModule } from 'quickjs-emscripten';
import type { SandboxResult, SandboxOptions } from '../types.js';

let quickjsInstance: QuickJSWASMModule | null = null;

async function getQuickJSInstance(): Promise<QuickJSWASMModule> {
  quickjsInstance ??= await getQuickJS();
  return quickjsInstance;
}

export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export async function executeInSandbox(
  code: string,
  options: SandboxOptions = {}
): Promise<ExecutionResult> {
  const { timeout = 5000, memoryLimit = 64 * 1024 * 1024 } = options;
  
  const QuickJS = await getQuickJSInstance();
  const vm = QuickJS.newContext();
  
  try {
    // Set up runtime with memory limit
    const runtime = vm.runtime;
    runtime.setMemoryLimit(memoryLimit);
    runtime.setMaxStackSize(512 * 1024); // 512KB stack

    // Set up interrupt handler for timeout
    const startTime = Date.now();
    let shouldInterrupt = false;
    
    runtime.setInterruptHandler(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed > timeout) {
        shouldInterrupt = true;
        return true;
      }
      return shouldInterrupt;
    });

    // Evaluate the code
    const result = vm.evalCode(code);

    if (result.error) {
      const error = result.error;
      let errorMsg: string;
      
      // Try to extract error message
      try {
        const msgHandle = vm.getProp(error, 'message');
        errorMsg = vm.getString(msgHandle);
        msgHandle.dispose();
      } catch {
        // Fallback to dumping the error
        const dumped = vm.dump(error);
        errorMsg = typeof dumped === 'object' && dumped !== null
          ? JSON.stringify(dumped)
          : String(dumped);
      }
      
      error.dispose();
      return {
        success: false,
        error: errorMsg,
      };
    }

    const value = vm.dump(result.value);
    result.value.dispose();

    return {
      success: true,
      result: value,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    vm.dispose();
  }
}

export async function extractStringsFromPrelude(
  preludeCode: string,
  stringArrayName: string,
  options?: SandboxOptions
): Promise<SandboxResult> {
  const wrappedCode = `
    ${preludeCode}
    
    // Extract the string array
    if (typeof ${stringArrayName} !== 'undefined') {
      ${stringArrayName};
    } else {
      throw new Error('String array ${stringArrayName} not found');
    }
  `;

  const result = await executeInSandbox(wrappedCode, options);
  
  if (!result.success) {
    return {
      strings: new Map(),
      errors: [result.error ?? 'Unknown error'],
    };
  }

  // Convert array to Map<number, string>
  const strings = new Map<number, string>();
  if (Array.isArray(result.result)) {
    result.result.forEach((str, idx) => {
      if (typeof str === 'string') {
        strings.set(idx, str);
      }
    });
  }

  return {
    strings,
    errors: [],
  };
}
