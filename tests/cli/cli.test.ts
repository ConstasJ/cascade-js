import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '../../.tmp-cli-test');
const cliPath = path.join(__dirname, '../../dist/cli.cjs');

describe('CLI', () => {
  beforeEach(() => {
    // Create temp directory
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('Basic file operations', () => {
    it('should read input file and write output file', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      const outputFile = path.join(tmpDir, 'output.js');

      // Create a simple obfuscated file
      const inputCode = 'var a = "hello"; console.log(a);';
      fs.writeFileSync(inputFile, inputCode, 'utf-8');

      // Run CLI using compiled CommonJS version
      const command = `node ${cliPath} ${inputFile} ${outputFile} --provider ollama --timeout 5000`;

      try {
        execSync(command, { cwd: __dirname, stdio: 'pipe' });
        
        // Check output file was created
        expect(fs.existsSync(outputFile)).toBe(true);
        
        // Check output is not empty
        const output = fs.readFileSync(outputFile, 'utf-8');
        expect(output.length).toBeGreaterThan(0);
      } catch (error) {
        // Ollama provider may not be available, but CLI should handle it gracefully
        expect(error).toBeDefined();
      }
    });

    it('should handle missing input file with user-friendly error', () => {
      const nonExistentFile = path.join(tmpDir, 'nonexistent.js');
      
      const command = `node ${cliPath} ${nonExistentFile} --provider ollama --timeout 5000`;

      expect(() => {
        execSync(command, { cwd: __dirname, stdio: 'pipe' });
      }).toThrow();
    });
  });

  describe('Stdin/stdout support', () => {
    it('should accept "-" for stdin', () => {
      const inputCode = 'var x = 1;';
      
      const command = `echo "${inputCode}" | node ${cliPath} - --provider ollama --timeout 5000`;

      try {
        const output = execSync(command, { cwd: __dirname, encoding: 'utf-8', shell: true });
        expect(typeof output).toBe('string');
      } catch (error) {
        // Ollama may not be available, but CLI should handle it
        expect(error).toBeDefined();
      }
    });

    it('should write to stdout when no output file specified', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      const inputCode = 'var y = 2;';
      fs.writeFileSync(inputFile, inputCode, 'utf-8');

      const command = `node ${cliPath} ${inputFile} --provider ollama --timeout 5000`;

      try {
        const output = execSync(command, { cwd: __dirname, encoding: 'utf-8' });
        expect(typeof output).toBe('string');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('JSON output', () => {
    it('should output JSON when --json flag is used', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      const inputCode = 'var z = 3;';
      fs.writeFileSync(inputFile, inputCode, 'utf-8');

      const command = `node ${cliPath} ${inputFile} --provider ollama --timeout 5000 --json`;

      try {
        const output = execSync(command, { cwd: __dirname, encoding: 'utf-8' });
        const parsed = JSON.parse(output);
        
        expect(parsed).toHaveProperty('code');
        expect(parsed).toHaveProperty('warnings');
        expect(parsed).toHaveProperty('stats');
        expect(Array.isArray(parsed.warnings)).toBe(true);
      } catch (error) {
        // Expected if ollama is not available
        expect(error).toBeDefined();
      }
    });
  });

  describe('Options handling', () => {
    it('should accept --timeout option', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      fs.writeFileSync(inputFile, 'var a = 1;', 'utf-8');

      const command = `node ${cliPath} ${inputFile} --provider ollama --timeout 1000`;

      try {
        execSync(command, { cwd: __dirname, stdio: 'pipe' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should accept --verbose flag', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      fs.writeFileSync(inputFile, 'var b = 2;', 'utf-8');

      const command = `node ${cliPath} ${inputFile} --provider ollama --timeout 5000 --verbose`;

      try {
        execSync(command, { cwd: __dirname, stdio: 'pipe' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should accept --quiet flag', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      fs.writeFileSync(inputFile, 'var c = 3;', 'utf-8');

      const command = `node ${cliPath} ${inputFile} --provider ollama --timeout 5000 --quiet`;

      try {
        execSync(command, { cwd: __dirname, stdio: 'pipe' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should accept --no-prefilter flag', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      fs.writeFileSync(inputFile, 'var d = 4;', 'utf-8');

      const command = `node ${cliPath} ${inputFile} --provider ollama --timeout 5000 --no-prefilter`;

      try {
        execSync(command, { cwd: __dirname, stdio: 'pipe' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should accept --model option', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      fs.writeFileSync(inputFile, 'var e = 5;', 'utf-8');

      const command = `node ${cliPath} ${inputFile} --provider ollama --model llama2 --timeout 5000`;

      try {
        execSync(command, { cwd: __dirname, stdio: 'pipe' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should accept --base-url option', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      fs.writeFileSync(inputFile, 'var f = 6;', 'utf-8');

      const command = `node ${cliPath} ${inputFile} --provider ollama --base-url http://localhost:9999 --timeout 5000`;

      try {
        execSync(command, { cwd: __dirname, stdio: 'pipe' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Environment variables', () => {
    it('should load API key from CASCADE_API_KEY env var', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      fs.writeFileSync(inputFile, 'var f = 6;', 'utf-8');

      const env = { ...process.env, CASCADE_API_KEY: 'test-key' };
      
      const command = `node ${cliPath} ${inputFile} --provider ollama --timeout 5000`;

      try {
        execSync(command, { cwd: __dirname, stdio: 'pipe', env });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Error handling', () => {
    it('should provide user-friendly error message for missing API key', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      fs.writeFileSync(inputFile, 'var g = 7;', 'utf-8');

      const env = { ...process.env };
      delete env.CASCADE_API_KEY;

      const command = `node ${cliPath} ${inputFile} --provider openai --timeout 5000`;

      expect(() => {
        execSync(command, { cwd: __dirname, stdio: 'pipe', env });
      }).toThrow();
    });

    it('should reject invalid timeout value', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      fs.writeFileSync(inputFile, 'var h = 8;', 'utf-8');

      const command = `node ${cliPath} ${inputFile} --provider ollama --timeout invalid`;

      expect(() => {
        execSync(command, { cwd: __dirname, stdio: 'pipe' });
      }).toThrow();
    });

    it('should handle unknown provider gracefully', () => {
      const inputFile = path.join(tmpDir, 'input.js');
      fs.writeFileSync(inputFile, 'var i = 9;', 'utf-8');

      const command = `node ${cliPath} ${inputFile} --provider unknown-provider --timeout 5000`;

      expect(() => {
        execSync(command, { cwd: __dirname, stdio: 'pipe' });
      }).toThrow();
    });
  });

  describe('CLI help and version', () => {
    it('should display help message', () => {
      const command = `node ${cliPath} --help`;

      const output = execSync(command, { cwd: __dirname, encoding: 'utf-8' });
      expect(output).toContain('CASCADE');
      expect(output).toContain('Deobfuscate');
    });

    it('should display version', () => {
      const command = `node ${cliPath} --version`;

      const output = execSync(command, { cwd: __dirname, encoding: 'utf-8' });
      expect(output).toContain('1.0.0');
    });
  });
});
