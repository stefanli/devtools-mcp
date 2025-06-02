import WebSocket from "ws";
import { EventEmitter } from "events";

// CDP Command schema. Commands are sent to the CDP server via websocket. The
// method is the CDP command name e.g. "DOM.getDocument" and params are the
// parameters for the command e.g "{ "depth": 1 }"
export interface CDPCommand {
  id: number;
  method: string;
  params?: any;
}

// CDP Response schema. The result contains the return object from the command
// execution.
export interface CDPResponse {
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

// CDP Event schema. Events can be emitted by the CDP server independently of
// commands.
export interface CDPEvent {
  method: string;
  params: any;
}

export interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

export class CDPClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private messageId = 1;
  private callbacks = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: any) => void }
  >();
  private url: string;

  constructor(webSocketUrl: string) {
    super();
    this.url = webSocketUrl;
  }

  /**
   * Connect to the CDP WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        this.emit("connected");
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        const rawMessage = JSON.parse(data.toString());

        // Check if it's a response to a command
        if (typeof rawMessage.id === "number") {
          const response = rawMessage as CDPResponse;
          const callback = this.callbacks.get(response.id);
          if (callback) {
            this.callbacks.delete(response.id);
            callback.resolve(response);
          }
        }
        // Check if it's an event from CDP
        else if (
          typeof rawMessage.method === "string" &&
          rawMessage.params !== undefined
        ) {
          const event = rawMessage as CDPEvent;
          this.emit("event", event.method, event.params);
        }
      });

      this.ws.on("close", () => {
        this.emit("disconnected");
        this.cleanup();
      });

      this.ws.on("error", (err: Error) => {
        this.emit("error", err);
        reject(err);
      });
    });
  }

  /**
   * Send a command via CDP. CDP errors are returned via the CDPResponse type
   * as-is. External errors are thrown.
   */
  async sendCommand(method: string, params?: any): Promise<CDPResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket is not connected"));
    }

    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error("WebSocket is not connected"));
        return;
      }

      const id = this.messageId++;

      const timeoutId = setTimeout(() => {
        if (this.callbacks.has(id)) {
          this.callbacks.delete(id);
          reject(new Error(`Command timed out after 10 seconds: ${method}`));
        }
      }, 10000);

      this.callbacks.set(id, {
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });

      const message: CDPCommand = { id, method, params };
      this.ws.send(JSON.stringify(message));

      this.emit("command", method, params);
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.cleanup();
    }
  }

  private cleanup(): void {
    this.ws = null;
    this.callbacks.clear();
  }

  /**
   * Static helper to get page targets
   */
  static async getPageTargets(targetUrl: string): Promise<CDPTarget[]> {
    const response = await fetch(targetUrl);
    const targets = (await response.json()) as CDPTarget[];
    return targets.filter((t) => t.type === "page");
  }
}
