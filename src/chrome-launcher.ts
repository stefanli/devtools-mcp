import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface ChromeLauncherOptions {
  port?: number;
  userDataDir?: string;
  chromePath?: string;
  additionalArgs?: string[];
  autoStart?: boolean;
}

export interface ChromeTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

/**
 * Utility class for managing Chrome instances with remote debugging enabled
 */
export class ChromeLauncher {
  private process: ChildProcess | null = null;
  private options: Required<ChromeLauncherOptions>;
  private startedByUs = false;

  constructor(options: ChromeLauncherOptions = {}) {
    this.options = {
      port: options.port ?? 9222,
      userDataDir: options.userDataDir ?? path.join(os.tmpdir(), "chrome-debug"),
      chromePath: options.chromePath ?? this.getDefaultChromePath(),
      additionalArgs: options.additionalArgs ?? [],
      autoStart: options.autoStart ?? true,
    };
  }

  /**
   * Check if Chrome debugging is already running by attempting to fetch targets
   */
  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${this.options.port}/json`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available Chrome targets
   */
  async getTargets(): Promise<ChromeTarget[]> {
    try {
      const response = await fetch(`http://localhost:${this.options.port}/json`);
      if (!response.ok) {
        return [];
      }
      return await response.json();
    } catch {
      return [];
    }
  }

  /**
   * Ensure Chrome is running with debugging enabled
   * If not running and autoStart is enabled, will attempt to start Chrome
   */
  async ensureRunning(): Promise<ChromeTarget[]> {
    // First check if Chrome is already running
    if (await this.isRunning()) {
      const targets = await this.getTargets();
      if (targets.length > 0) {
        return targets;
      }
    }

    // If not running and autoStart is disabled, throw error
    if (!this.options.autoStart) {
      throw new Error(
        `Chrome debugging not available on port ${this.options.port}. ` +
        "Please start Chrome with --remote-debugging-port or enable autoStart."
      );
    }

    // Attempt to start Chrome
    await this.start();

    // Wait for Chrome to be ready and return targets
    return await this.waitForTargets();
  }

  /**
   * Start Chrome with remote debugging enabled
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error("Chrome process is already running");
    }

    const chromePath = this.options.chromePath;
    if (!fs.existsSync(chromePath)) {
      throw new Error(
        `Chrome executable not found at: ${chromePath}. ` +
        "Please install Chrome or specify the correct path."
      );
    }

    const args = this.buildChromeArgs();

    console.error(`Starting Chrome with debugging on port ${this.options.port}...`);
    
    this.process = spawn(chromePath, args, {
      detached: false,
      stdio: ["ignore", "ignore", "pipe"],
    });

    this.startedByUs = true;

    // Handle process events
    this.process.on("error", (error) => {
      console.error("Chrome process error:", error);
      this.cleanup();
    });

    this.process.on("exit", (code, signal) => {
      console.error(`Chrome process exited with code ${code}, signal ${signal}`);
      this.cleanup();
    });

    // Capture stderr for debugging
    if (this.process.stderr) {
      this.process.stderr.on("data", (data) => {
        // Only log Chrome errors, not normal output
        const message = data.toString();
        if (message.includes("ERROR") || message.includes("FATAL")) {
          console.error("Chrome stderr:", message);
        }
      });
    }
  }

  /**
   * Stop Chrome if we started it
   */
  stop(): void {
    if (this.process && this.startedByUs) {
      console.error("Stopping Chrome process...");
      this.process.kill("SIGTERM");
      
      // Force kill after 5 seconds if it doesn't exit gracefully
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          console.error("Force killing Chrome process...");
          this.process.kill("SIGKILL");
        }
      }, 5000);
    }
    this.cleanup();
  }

  /**
   * Wait for Chrome to start and have available targets
   */
  private async waitForTargets(maxWaitMs = 10000): Promise<ChromeTarget[]> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const targets = await this.getTargets();
        if (targets.length > 0) {
          console.error(`Chrome ready with ${targets.length} target(s)`);
          return targets;
        }
      } catch {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(
      `Chrome failed to start or become ready within ${maxWaitMs}ms. ` +
      "Please check that Chrome can start properly."
    );
  }

  /**
   * Build Chrome command line arguments
   */
  private buildChromeArgs(): string[] {
    const args = [
      `--remote-debugging-port=${this.options.port}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${this.options.userDataDir}`,
      "--no-first-run",
      "--disable-default-apps",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=TranslateUI",
      "--disable-ipc-flooding-protection",
      ...this.options.additionalArgs,
    ];

    return args;
  }

  /**
   * Get the default Chrome executable path for the current platform
   */
  private getDefaultChromePath(): string {
    const platform = os.platform();
    
    switch (platform) {
      case "darwin": // macOS
        return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
      
      case "win32": // Windows
        const windowsPaths = [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
        ];
        
        for (const chromePath of windowsPaths) {
          if (fs.existsSync(chromePath)) {
            return chromePath;
          }
        }
        return windowsPaths[0]; // Return first as fallback
      
      case "linux":
        // Try common Linux Chrome paths
        const linuxPaths = [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium-browser",
          "/usr/bin/chromium",
        ];
        
        for (const chromePath of linuxPaths) {
          if (fs.existsSync(chromePath)) {
            return chromePath;
          }
        }
        return "google-chrome"; // Fallback to PATH lookup
      
      default:
        return "google-chrome"; // Generic fallback
    }
  }

  /**
   * Clean up process references
   */
  private cleanup(): void {
    this.process = null;
    this.startedByUs = false;
  }
}
