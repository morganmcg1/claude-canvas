import { spawn, spawnSync } from "child_process";

/**
 * Auto-start tmux session and spawn canvas inside it
 */
async function autoStartTmux(kind: string, id: string, configJson?: string, options?: SpawnOptions): Promise<SpawnResult> {
  const scriptDir = import.meta.dir.replace("/src", "");
  const socketPath = options?.socketPath || `/tmp/canvas-${id}.sock`;

  // Build the canvas command to run inside tmux
  let canvasCmd = `cd "${scriptDir}" && bun run src/cli.ts show ${kind} --id ${id}`;
  if (configJson) {
    const configFile = `/tmp/canvas-config-${id}.json`;
    await Bun.write(configFile, configJson);
    canvasCmd += ` --config "$(cat ${configFile})"`;
  }
  canvasCmd += ` --socket ${socketPath}`;
  if (options?.scenario) {
    canvasCmd += ` --scenario ${options.scenario}`;
  }

  // Create a new tmux session with the canvas, then split for leet if wandb
  const sessionName = `canvas-${id}`;

  if (kind === "wandb" && configJson) {
    const config = JSON.parse(configJson);
    const runDir = config.runDir;
    const leetArgs = config.leetArgs?.join(" ") || "";
    const leetCmd = `wandb beta leet ${runDir} ${leetArgs}`.trim();

    // Create session with canvas on left, leet on right
    const tmuxScript = `
      tmux new-session -d -s ${sessionName} -x 200 -y 50 '${canvasCmd}' && \
      tmux split-window -h -t ${sessionName} -p 60 '${leetCmd}' && \
      tmux select-pane -t ${sessionName}:0.0 && \
      tmux attach-session -t ${sessionName}
    `.trim().replace(/\n\s*/g, " ");

    // Open in a new Terminal window on macOS
    if (process.platform === "darwin") {
      const script = `tell application "Terminal"
        do script "${tmuxScript.replace(/"/g, '\\"')}"
        activate
      end tell`;

      Bun.spawn(["osascript", "-e", script], {
        stdio: ["ignore", "ignore", "ignore"],
      });

      return { method: "tmux-auto" };
    }
  }

  throw new Error("Auto-tmux only supported on macOS for wandb canvas");
}

export interface TerminalEnvironment {
  inTmux: boolean;
  summary: string;
}

export function detectTerminal(): TerminalEnvironment {
  const inTmux = !!process.env.TMUX;
  const summary = inTmux ? "tmux" : "no tmux";
  return { inTmux, summary };
}

export interface SpawnResult {
  method: string;
  pid?: number;
}

export interface SpawnOptions {
  socketPath?: string;
  scenario?: string;
}

export async function spawnCanvas(
  kind: string,
  id: string,
  configJson?: string,
  options?: SpawnOptions
): Promise<SpawnResult> {
  const env = detectTerminal();

  // For wandb canvas without tmux, auto-start tmux with the full canvas experience
  if (!env.inTmux && kind === "wandb" && configJson) {
    return autoStartTmux(kind, id, configJson, options);
  }

  if (!env.inTmux) {
    throw new Error("Canvas requires tmux. Please run inside a tmux session.");
  }

  // Get the directory of this script (skill directory)
  const scriptDir = import.meta.dir.replace("/src", "");
  const runScript = `${scriptDir}/run-canvas.sh`;

  // Auto-generate socket path for IPC if not provided
  const socketPath = options?.socketPath || `/tmp/canvas-${id}.sock`;

  // Build the command to run
  let command = `${runScript} show ${kind} --id ${id}`;
  if (configJson) {
    // Write config to a temp file to avoid shell escaping issues
    const configFile = `/tmp/canvas-config-${id}.json`;
    await Bun.write(configFile, configJson);
    command += ` --config "$(cat ${configFile})"`;
  }
  command += ` --socket ${socketPath}`;
  if (options?.scenario) {
    command += ` --scenario ${options.scenario}`;
  }

  const result = await spawnTmux(command);
  if (result) return { method: "tmux" };

  throw new Error("Failed to spawn tmux pane");
}

// File to track the canvas pane ID
const CANVAS_PANE_FILE = "/tmp/claude-canvas-pane-id";

async function getCanvasPaneId(): Promise<string | null> {
  try {
    const file = Bun.file(CANVAS_PANE_FILE);
    if (await file.exists()) {
      const paneId = (await file.text()).trim();
      // Verify the pane still exists by checking if tmux can find it
      const result = spawnSync("tmux", ["display-message", "-t", paneId, "-p", "#{pane_id}"]);
      const output = result.stdout?.toString().trim();
      // Pane exists only if command succeeds AND returns the same pane ID
      if (result.status === 0 && output === paneId) {
        return paneId;
      }
      // Stale pane reference - clean up the file
      await Bun.write(CANVAS_PANE_FILE, "");
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function saveCanvasPaneId(paneId: string): Promise<void> {
  await Bun.write(CANVAS_PANE_FILE, paneId);
}

async function createNewPane(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Use split-window -h for vertical split (side by side)
    // -p 67 gives canvas 2/3 width (1:2 ratio, Claude:Canvas)
    // -P -F prints the new pane ID so we can save it
    const args = ["split-window", "-h", "-p", "67", "-P", "-F", "#{pane_id}", command];
    const proc = spawn("tmux", args);
    let paneId = "";
    proc.stdout?.on("data", (data) => {
      paneId += data.toString();
    });
    proc.on("close", async (code) => {
      if (code === 0 && paneId.trim()) {
        await saveCanvasPaneId(paneId.trim());
      }
      resolve(code === 0);
    });
    proc.on("error", () => resolve(false));
  });
}

async function reuseExistingPane(paneId: string, command: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Send Ctrl+C to interrupt any running process
    const killProc = spawn("tmux", ["send-keys", "-t", paneId, "C-c"]);
    killProc.on("close", () => {
      // Wait for process to terminate before sending new command
      setTimeout(() => {
        // Clear the terminal and run the new command
        const args = ["send-keys", "-t", paneId, `clear && ${command}`, "Enter"];
        const proc = spawn("tmux", args);
        proc.on("close", (code) => resolve(code === 0));
        proc.on("error", () => resolve(false));
      }, 150);
    });
    killProc.on("error", () => resolve(false));
  });
}

async function spawnTmux(command: string): Promise<boolean> {
  // Check if we have an existing canvas pane to reuse
  const existingPaneId = await getCanvasPaneId();

  if (existingPaneId) {
    // Try to reuse existing pane
    const reused = await reuseExistingPane(existingPaneId, command);
    if (reused) {
      return true;
    }
    // Reuse failed (pane may have been closed) - clear stale reference and create new
    await Bun.write(CANVAS_PANE_FILE, "");
  }

  // Create a new split pane
  return createNewPane(command);
}

// ============================================
// Leet Pane Management (for W&B Canvas)
// ============================================

const LEET_PANE_FILE = "/tmp/claude-leet-pane-id";

export async function getLeetPaneId(): Promise<string | null> {
  try {
    const file = Bun.file(LEET_PANE_FILE);
    if (await file.exists()) {
      const paneId = (await file.text()).trim();
      if (!paneId) return null;
      // Verify the pane still exists
      const result = spawnSync("tmux", ["display-message", "-t", paneId, "-p", "#{pane_id}"]);
      const output = result.stdout?.toString().trim();
      if (result.status === 0 && output === paneId) {
        return paneId;
      }
      await Bun.write(LEET_PANE_FILE, "");
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function saveLeetPaneId(paneId: string): Promise<void> {
  await Bun.write(LEET_PANE_FILE, paneId);
}

export interface SpawnLeetOptions {
  runDir: string;
  leetArgs?: string[];
}

/**
 * Spawn wandb leet in a new tmux pane
 * Returns the pane ID if successful
 */
export async function spawnLeetPane(options: SpawnLeetOptions): Promise<string | null> {
  const env = detectTerminal();
  if (!env.inTmux) {
    throw new Error("Leet requires tmux. Please run inside a tmux session.");
  }

  // Check for existing Leet pane
  const existingPaneId = await getLeetPaneId();
  if (existingPaneId) {
    // Kill existing pane first
    await killLeetPane();
  }

  // Build the leet command
  const leetArgs = options.leetArgs?.join(" ") || "";
  const command = `wandb beta leet ${options.runDir} ${leetArgs}`.trim();

  return new Promise((resolve) => {
    // Split vertically, Leet gets right side (50%)
    const args = ["split-window", "-h", "-p", "50", "-P", "-F", "#{pane_id}", command];
    const proc = spawn("tmux", args);
    let paneId = "";
    proc.stdout?.on("data", (data) => {
      paneId += data.toString();
    });
    proc.on("close", async (code) => {
      if (code === 0 && paneId.trim()) {
        await saveLeetPaneId(paneId.trim());
        resolve(paneId.trim());
      } else {
        resolve(null);
      }
    });
    proc.on("error", () => resolve(null));
  });
}

/**
 * Capture the current output of the Leet pane
 * Returns the terminal content with ANSI escape codes
 */
export async function captureLeetPane(): Promise<string | null> {
  const paneId = await getLeetPaneId();
  if (!paneId) return null;

  return new Promise((resolve) => {
    // -p prints to stdout, -e includes escape sequences (colors)
    const args = ["capture-pane", "-p", "-e", "-t", paneId];
    const proc = spawn("tmux", args);
    let output = "";
    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });
    proc.on("close", (code) => {
      resolve(code === 0 ? output : null);
    });
    proc.on("error", () => resolve(null));
  });
}

/**
 * Send keystrokes to the Leet pane for navigation
 */
export async function sendKeysToLeet(keys: string): Promise<boolean> {
  const paneId = await getLeetPaneId();
  if (!paneId) return false;

  return new Promise((resolve) => {
    const args = ["send-keys", "-t", paneId, keys];
    const proc = spawn("tmux", args);
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

/**
 * Kill the Leet pane if it exists
 */
export async function killLeetPane(): Promise<boolean> {
  const paneId = await getLeetPaneId();
  if (!paneId) return true;

  return new Promise((resolve) => {
    const args = ["kill-pane", "-t", paneId];
    const proc = spawn("tmux", args);
    proc.on("close", async (code) => {
      await Bun.write(LEET_PANE_FILE, "");
      resolve(code === 0);
    });
    proc.on("error", async () => {
      await Bun.write(LEET_PANE_FILE, "");
      resolve(false);
    });
  });
}

/**
 * Check if Leet pane is still running
 */
export async function isLeetPaneAlive(): Promise<boolean> {
  const paneId = await getLeetPaneId();
  return paneId !== null;
}

