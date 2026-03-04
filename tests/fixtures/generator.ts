import JavaScriptObfuscator from 'javascript-obfuscator';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SAMPLES_DIR = join(__dirname, 'samples');

// Obfuscation presets matching Obfuscator.io levels
const PRESETS = {
  default: {},
  low: {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    stringArray: true,
    stringArrayThreshold: 0.5,
    rotateStringArray: true,
  },
  medium: {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.3,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.2,
    stringArray: true,
    stringArrayThreshold: 0.75,
    rotateStringArray: true,
    stringArrayEncoding: ['base64'],
  },
  high: {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    stringArray: true,
    stringArrayThreshold: 1,
    rotateStringArray: true,
    stringArrayEncoding: ['rc4', 'base64'],
    selfDefending: true,
    debugProtection: true,
  },
};

// Source files to obfuscate
const SOURCES = [
  {
    name: 'hello-world',
    content: `console.log('Hello World!');`,
  },
  {
    name: 'api-calls',
    content: `
async function fetchData() {
  const response = await fetch('https://api.example.com/data');
  const data = await response.json();
  console.log(data);
  return data;
}
fetchData();
`,
  },
  {
    name: 'string-ops',
    content: `
function greet(name) {
  const message = 'Hello, ' + name + '!';
  console.log(message);
  return message;
}
greet('World');
`,
  },
  {
    name: 'multi-function',
    content: `
function add(a, b) {
  return a + b;
}
function subtract(a, b) {
  return a - b;
}
function multiply(a, b) {
  return a * b;
}
console.log(add(2, 3));
console.log(subtract(5, 2));
console.log(multiply(4, 5));
`,
  },
];

async function generateFixtures() {
  // Create output directory
  if (!existsSync(SAMPLES_DIR)) {
    mkdirSync(SAMPLES_DIR, { recursive: true });
  }

  for (const source of SOURCES) {
    // Write original
    writeFileSync(join(SAMPLES_DIR, `${source.name}.js`), source.content);

    // Generate obfuscated versions
    for (const [level, config] of Object.entries(PRESETS)) {
      const obfuscated = JavaScriptObfuscator.obfuscate(source.content, config);
      const outputName = `${source.name}.obfuscated.${level}.js`;
      writeFileSync(join(SAMPLES_DIR, outputName), obfuscated.getObfuscatedCode());
      console.warn(`Generated: ${outputName}`);
    }
  }

  console.warn('\nAll fixtures generated successfully!');
}

generateFixtures().catch(console.error);
