# devtools-mcp

A MCP server that provides Chrome DevTools Protocol access to LLMs.

- Execute any CDP command through the `cdp_command` tool
- Automatic binary data handling - large responses (screenshots, PDFs) are saved to files

## Setup

1. Start Chrome with remote debugging:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/tmp/chrome-debug \
  --no-first-run \
  --disable-default-apps
```

2. Install dependencies:

```bash
npm install
```

3. Add as local MCP server. E.g. with Claude Code:

```bash
claude mcp add devtools-server -- npx tsx ~/projects/devtools-mcp/src/index.ts
```

## Usage

The server exposes a single `cdp_command` tool that accepts:

- `method`: Any CDP command (e.g., "Page.navigate", "Runtime.evaluate")
- `params`: JSON string of command parameters (optional)

Binary data (screenshots, etc.) is automatically saved to `./cdp-output/` with file path references returned instead of raw data.
