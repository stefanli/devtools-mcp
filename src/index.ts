#!/usr/bin/env tsx

import { CDPMcpServer } from "./cdp-mcp-server.js";

const DEVTOOLS_URL = "http://localhost:9222/json";

async function main() {
  const server = new CDPMcpServer(DEVTOOLS_URL);

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
