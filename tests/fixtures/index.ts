import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Fixture {
  name: string;
  original: string;
  obfuscated: {
    default: string;
    low: string;
    medium: string;
    high: string;
  };
}

const SAMPLES_DIR = join(__dirname, 'samples');

export const fixtures = {
  'hello-world': {
    name: 'hello-world',
    original: join(SAMPLES_DIR, 'hello-world.js'),
    obfuscated: {
      default: join(SAMPLES_DIR, 'hello-world.obfuscated.default.js'),
      low: join(SAMPLES_DIR, 'hello-world.obfuscated.low.js'),
      medium: join(SAMPLES_DIR, 'hello-world.obfuscated.medium.js'),
      high: join(SAMPLES_DIR, 'hello-world.obfuscated.high.js'),
    },
  },
  'api-calls': {
    name: 'api-calls',
    original: join(SAMPLES_DIR, 'api-calls.js'),
    obfuscated: {
      default: join(SAMPLES_DIR, 'api-calls.obfuscated.default.js'),
      low: join(SAMPLES_DIR, 'api-calls.obfuscated.low.js'),
      medium: join(SAMPLES_DIR, 'api-calls.obfuscated.medium.js'),
      high: join(SAMPLES_DIR, 'api-calls.obfuscated.high.js'),
    },
  },
  'string-ops': {
    name: 'string-ops',
    original: join(SAMPLES_DIR, 'string-ops.js'),
    obfuscated: {
      default: join(SAMPLES_DIR, 'string-ops.obfuscated.default.js'),
      low: join(SAMPLES_DIR, 'string-ops.obfuscated.low.js'),
      medium: join(SAMPLES_DIR, 'string-ops.obfuscated.medium.js'),
      high: join(SAMPLES_DIR, 'string-ops.obfuscated.high.js'),
    },
  },
  'multi-function': {
    name: 'multi-function',
    original: join(SAMPLES_DIR, 'multi-function.js'),
    obfuscated: {
      default: join(SAMPLES_DIR, 'multi-function.obfuscated.default.js'),
      low: join(SAMPLES_DIR, 'multi-function.obfuscated.low.js'),
      medium: join(SAMPLES_DIR, 'multi-function.obfuscated.medium.js'),
      high: join(SAMPLES_DIR, 'multi-function.obfuscated.high.js'),
    },
  },
};

export type FixtureName = keyof typeof fixtures;
