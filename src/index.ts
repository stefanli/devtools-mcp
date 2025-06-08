#!/usr/bin/env tsx

import { CDPMcpServer } from "./cdp-mcp-server.js";
import { ChromeLauncherOptions } from "./chrome-launcher.js";

const DEVTOOLS_URL = "http://localhost:9222/json";

async function main() {
  // Chrome launcher options can be configured via environment variables
  const chromeLauncherOptions: ChromeLauncherOptions = {
    port: parseInt(process.env.CHROME_DEBUG_PORT || "9222"),
    autoStart: process.env.CHROME_AUTO_START !== "false",
    chromePath: process.env.CHROME_PATH,
    userDataDir: process.env.CHROME_USER_DATA_DIR,
  };

  const server = new CDPMcpServer(DEVTOOLS_URL, chromeLauncherOptions);

  process.on("SIGINT", async () => {
    console.error("Received SIGINT, shutting down gracefully...");
    await server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.error("Received SIGTERM, shutting down gracefully...");
    await server.stop();
    process.exit(0);
  });

  try {
    await server.start();
  } catch (error) {
    console.error("Failed to start CDP MCP server:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
