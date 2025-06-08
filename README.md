# devtools-mcp

A MCP server that provides Chrome DevTools Protocol access to LLMs.

- Execute any CDP command through the `cdp_command` tool
- **Automatic Chrome startup** - Chrome will be started automatically with debugging enabled
- Automatic binary data handling - large responses (screenshots, PDFs) are saved to files
- Cross-platform support (macOS, Windows, Linux)

## Setup

### Quick Start (Recommended)

The server will automatically start Chrome with remote debugging when needed. No manual setup required!

1. Install dependencies:

```bash
npm install
```

2. Add as local MCP server. E.g. with Claude Code:

```bash
claude mcp add devtools-server -- npx tsx ~/projects/devtools-mcp/src/index.ts
```

### Manual Chrome Setup (Optional)

If you prefer to start Chrome manually or need custom configuration:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/tmp/chrome-debug \
  --no-first-run \
  --disable-default-apps
```

## Configuration

The server can be configured using environment variables:

- `CHROME_AUTO_START`: Set to `false` to disable automatic Chrome startup (default: `true`)
- `CHROME_DEBUG_PORT`: Chrome debugging port (default: `9222`)
- `CHROME_PATH`: Custom path to Chrome executable
- `CHROME_USER_DATA_DIR`: Custom Chrome user data directory

Example:
```bash
CHROME_AUTO_START=false npx tsx src/index.ts
```

## Usage

The server exposes a single `cdp_command` tool that accepts:

- `method`: Any CDP command (e.g., "Page.navigate", "Runtime.evaluate")
- `params`: JSON string of command parameters (optional)

Binary data (screenshots, etc.) is automatically saved to `./cdp-output/` with file path references returned instead of raw data.

## Platform Support

The server automatically detects and supports:
- **macOS**: Uses `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Windows**: Searches common Chrome installation paths
- **Linux**: Uses `google-chrome`, `chromium-browser`, or other common paths

If Chrome is not found in the default location, you can specify a custom path using the `CHROME_PATH` environment variable.
