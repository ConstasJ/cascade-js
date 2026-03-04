# CLI Reference

cascade-js provides a command-line interface for deobfuscating JavaScript code using AST-based transformations with optional LLM assistance.

## Installation

Install globally via npm:

```bash
npm install -g cascade-js
```

Or via pnpm:

```bash
pnpm add -g cascade-js
```

## Synopsis

```
cascade-js [options] [input] [output]
```

## Arguments

| Argument | Description |
|----------|-------------|
| `input`  | Path to the input JavaScript file, or `-` to read from stdin. If omitted, defaults to stdin. |
| `output` | Path to the output file, or `-` to write to stdout. If omitted, defaults to stdout. |

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--provider <name>` | string | `openai` | LLM provider to use. Options: `openai`, `anthropic`, `gemini`, `ollama`. |
| `--model <name>` | string | `gpt-4` | Model name for the selected provider. |
| `--api-key <key>` | string | - | API key for authentication. Can also be set via `CASCADE_API_KEY` environment variable. |
| `--base-url <url>` | string | - | Custom API base URL for the provider. |
| `--timeout <ms>` | number | `60000` | Timeout in milliseconds for LLM requests. |
| `--verbose` | boolean | `false` | Enable verbose logging for debugging. |
| `--quiet` | boolean | `false` | Suppress non-essential output. Only errors are printed. |
| `--no-prefilter` | boolean | `false` | Skip obfuscation detection. Process input even if not detected as obfuscated. |
| `--json` | boolean | `false` | Output results as JSON with code, warnings, and stats. |

## Examples

### Basic file to file

Deobfuscate a file and save the result:

```bash
cascade-js obfuscated.js deobfuscated.js
```

### Stdin/stdout piping

Read from stdin and write to stdout:

```bash
cat obfuscated.js | cascade-js > deobfuscated.js
```

Or using echo:

```bash
echo 'eval(function(p,a,c,k,e,d)...' | cascade-js -
```

### Using with Anthropic provider

Use Anthropic's Claude models:

```bash
cascade-js --provider anthropic --model claude-3-opus-20240229 obfuscated.js output.js
```

### Using with Ollama (local, no API key needed)

Run completely offline using a local Ollama instance:

```bash
cascade-js --provider ollama --model codellama obfuscated.js output.js
```

No API key is required when using Ollama.

### Custom model selection

Use a specific model with OpenAI:

```bash
cascade-js --model gpt-4-turbo obfuscated.js output.js
```

Or with Gemini:

```bash
cascade-js --provider gemini --model gemini-1.5-pro obfuscated.js output.js
```

### JSON output for scripting

Get structured output for integration with other tools:

```bash
cascade-js --json obfuscated.js > result.json
```

Parse the result with jq:

```bash
cascade-js --json obfuscated.js | jq -r '.code'
```

### Verbose mode for debugging

See detailed logs of each transformation pass:

```bash
cascade-js --verbose obfuscated.js output.js
```

### Skipping prefilter detection

Force processing even if the code is not detected as obfuscated:

```bash
cascade-js --no-prefilter normal.js output.js
```

### Timeout configuration

Increase timeout for slow LLM responses:

```bash
cascade-js --timeout 120000 obfuscated.js output.js
```

Or with a local Ollama instance that might need more time:

```bash
cascade-js --provider ollama --timeout 300000 obfuscated.js output.js
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CASCADE_API_KEY` | API key for the selected LLM provider. Used when `--api-key` is not provided. |

Example usage:

```bash
export CASCADE_API_KEY="sk-..."
cascade-js obfuscated.js output.js
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0`  | Success. The deobfuscation completed without errors. |
| `1`  | Error. An error occurred during processing (invalid input, API failure, timeout, etc.). |

## JSON Output Format

When using `--json`, the output is a JSON object with the following structure:

```json
{
  "code": "// The deobfuscated JavaScript code",
  "warnings": [
    "Warning message 1",
    "Warning message 2"
  ],
  "stats": {
    "passesRun": 5,
    "timeMs": 1234
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | The deobfuscated JavaScript code. |
| `warnings` | string[] | Array of warning messages generated during processing. |
| `stats.passesRun` | number | Number of transformation passes that were executed. |
| `stats.timeMs` | number | Total processing time in milliseconds. |

When `--json` is not used, stats are printed to stderr instead:

```
Stats: 5 passes in 1234ms
```

## Notes

**LLM is optional.** Most deobfuscation passes work without an LLM and use pure AST transformations. The LLM is only invoked for passes that benefit from semantic understanding, such as variable naming and complex string array deobfuscation.

**String array detection** has both pure-AST and LLM-assisted paths. Simple string arrays are handled automatically. Complex or heavily obfuscated arrays may be sent to the LLM for analysis when a provider is configured.

**Ollama runs locally** and does not require an API key. Ensure you have Ollama installed and running locally before using `--provider ollama`. The model specified with `--model` must be pulled in Ollama first (`ollama pull codellama`).

**Prefilter behavior:** By default, cascade-js checks if the input code appears to be obfuscated using a confidence scoring system. If the code is not detected as obfuscated (low confidence), processing is skipped to avoid unnecessary API calls. Use `--no-prefilter` to bypass this check.

**Timeouts:** The default timeout is 60 seconds. LLM providers may occasionally take longer, especially for large files or complex obfuscation patterns. Increase the timeout if you encounter timeout errors.
