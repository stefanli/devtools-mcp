import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { CDPClient } from "./cdp-client.js";
import { processBinaryData } from "./utils.js";

/**
 * MCP server that connects to a CDP endpoint and exposes the raw command
 * interface to the LLM.
 */
export class CDPMcpServer {
  private server: Server;
  private cdpUrl: string;
  private cdpClient: CDPClient | null = null;
  private connected = false;

  constructor(cdpUrl: string) {
    this.cdpUrl = cdpUrl;
    this.server = new Server(
      {
        name: "DevTools MCP server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // Define available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "cdp_command",
            description:
              "Send a Chrome DevTools Protocol command to the connected page",
            inputSchema: {
              type: "object",
              properties: {
                method: {
                  type: "string",
                  description:
                    'Any CDP command name (e.g., "Runtime.evaluate", "Page.navigate")',
                },
                params: {
                  type: "string",
                  description:
                    'JSON string of parameters for the CDP command(optional, defaults to "{}")',
                  default: "{}",
                },
              },
              required: ["method"],
            },
          },
        ] as Tool[],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: any) => {
        const { name, arguments: args } = request.params;

        try {
          switch (name) {
            case "cdp_command":
              return await this.handleCdpCommand(args);

            default:
              throw new Error(`Unknown tool: ${name}`);
          }
        } catch (error) {
          // Convert thrown errors to strings for LLM interpretation
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              {
                type: "text",
                text: `Error: ${errorMessage}`,
              },
            ],
          };
        }
      }
    );
  }

  private async handleCdpCommand(args: any) {
    const method = args?.method;
    if (!method || typeof method !== "string") {
      throw new Error("Method parameter is required and must be a string");
    }

    // Parse params JSON string, default to empty object
    let params = {};
    if (args?.params && typeof args.params === "string") {
      try {
        params = JSON.parse(args.params);
      } catch (error) {
        throw new Error(
          `Invalid JSON in params: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Ensure we're connected
    await this.ensureConnected();

    if (!this.cdpClient) {
      throw new Error("Failed to establish CDP connection");
    }

    // Send the command and return full response
    const response = await this.cdpClient.sendCommand(method, params);

    // Process response to handle potential binary data, e.g. screenshots
    const processedResponse = processBinaryData(response, "./cdp-output");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(processedResponse, null, 2),
        },
      ],
    };
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected && this.cdpClient) {
      return;
    }

    try {
      // Get available targets
      const targets = await CDPClient.getPageTargets(this.cdpUrl);
      if (targets.length === 0) {
        throw new Error(
          "No page targets available. Make sure Chrome/Chromium is running with --remote-debugging-port=9222"
        );
      }

      // Connect to the first available target
      const target = targets[0];
      this.cdpClient = new CDPClient(target.webSocketDebuggerUrl);

      // Set up error handling
      this.cdpClient.on("error", (error) => {
        console.error("CDP Client error:", error);
        this.connected = false;
      });

      this.cdpClient.on("disconnected", () => {
        console.error("CDP Client disconnected");
        this.connected = false;
      });

      await this.cdpClient.connect();
      this.connected = true;

      console.log(`Connected to CDP target: ${target.title} (${target.url})`);
    } catch (error) {
      this.connected = false;
      this.cdpClient = null;
      throw new Error(
        `Failed to connect to CDP: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("CDP MCP Server started on stdio");
  }

  async stop() {
    if (this.cdpClient) {
      this.cdpClient.disconnect();
      this.cdpClient = null;
      this.connected = false;
    }
    await this.server.close();
  }
}
