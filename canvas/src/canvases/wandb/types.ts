// W&B Canvas Type Definitions

// ============================================
// Configuration Types (from Claude to Canvas)
// ============================================

export interface WandbConfig {
  /** Path to run directory containing .wandb folder */
  runDir: string;
  /** Custom title for canvas */
  title?: string;
  /** Additional arguments to pass to wandb beta leet */
  leetArgs?: string[];
  /** Refresh interval in ms for live runs (0 = no auto-refresh) */
  refreshInterval?: number;
}

// ============================================
// View State Types (Canvas to Claude)
// ============================================

export interface WandbViewState {
  /** Raw terminal output from Leet (for Claude to "see") */
  terminalSnapshot: string;
  /** Terminal dimensions */
  terminalDimensions: { cols: number; rows: number };

  /** Structured run information (from .wandb parsing) */
  runInfo: WandbRunInfo | null;

  /** Current metrics being displayed */
  visibleMetrics: WandbMetricSummary[];

  /** System metrics if available */
  systemMetrics?: WandbSystemMetrics;

  /** Pane management info */
  leetPaneId: string | null;

  /** Errors encountered */
  errors?: string[];

  /** ISO datetime of last update */
  lastUpdated: string;
}

export interface WandbRunInfo {
  id: string;
  name: string;
  displayName?: string;
  state: "running" | "finished" | "failed" | "crashed" | "unknown";
  config: Record<string, unknown>;
  summary: Record<string, number>;
  createdAt?: string;
  host?: string;
  runtime?: number;
}

export interface WandbMetricSummary {
  key: string;
  latestValue: number;
  trend: "up" | "down" | "stable";
  dataPoints: number;
  minValue?: number;
  maxValue?: number;
}

export interface WandbSystemMetrics {
  gpu?: {
    utilization: number;
    memory: number;
    temperature?: number;
  };
  cpu?: number;
  memory?: number;
  disk?: number;
}

// ============================================
// Result Types (user selection/action)
// ============================================

export interface WandbResult {
  action: "closed" | "exported" | "selected";
  selectedMetrics?: string[];
  exportedData?: unknown;
}

// ============================================
// IPC Extension Types
// ============================================

export type WandbControllerMessage =
  | { type: "getViewState" }
  | { type: "sendKeys"; keys: string }
  | { type: "refresh" }
  | { type: "focusLeet" }
  | { type: "focusCanvas" };

export type WandbCanvasMessage =
  | { type: "viewState"; data: WandbViewState }
  | { type: "leetOutput"; output: string }
  | { type: "leetStarted"; paneId: string }
  | { type: "leetExited"; exitCode: number };

// ============================================
// Leet Pane Types
// ============================================

export interface LeetPaneState {
  paneId: string | null;
  isRunning: boolean;
  lastCapture: string;
  lastCaptureTime: Date | null;
}
