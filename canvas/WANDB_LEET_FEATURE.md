# W&B Leet Canvas Feature

A Claude Code Canvas that wraps [wandb Leet](https://github.com/wandb/wandb/pull/10764) to display live and historic W&B runs with beautiful braille visualizations.

## Overview

This feature enables Claude to:
1. **See** W&B run visualizations via `wandb beta leet`
2. **Understand** the underlying metrics data (structured parsing)
3. **Navigate** through runs and metrics by sending keystrokes
4. **Monitor** live training runs in real-time

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         tmux session                            │
├────────────────────────────┬────────────────────────────────────┤
│                            │                                    │
│    Claude Code Canvas      │        wandb beta leet             │
│    (React/Ink TUI)         │        (Go/Bubble Tea)             │
│                            │                                    │
│  ┌──────────────────────┐  │  ┌────────────────────────────────┐│
│  │ Status & Controls    │  │  │ ⣿⣿⣿ Braille Charts ⣿⣿⣿      ││
│  │                      │  │  │                                ││
│  │ • Leet Running ✓     │  │  │ train/loss                     ││
│  │ • Last update: 12:34 │  │  │ ⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀                ││
│  │                      │  │  │ ⠈⠱⡀⠀⠀⠀⠀⠀⠀⠀                ││
│  │ Keyboard:            │  │  │ ⠀⠀⠈⠱⣀⠀⠀⠀⠀⠀                ││
│  │ Tab - switch panels  │  │  │ ⠀⠀⠀⠀⠀⠉⠒⠤⣀⣀                ││
│  │ Arrows - navigate    │  │  │                                ││
│  │ r - restart          │  │  │ Metrics Grid | System Metrics  ││
│  │ q - quit             │  │  │                                ││
│  └──────────────────────┘  │  └────────────────────────────────┘│
│                            │                                    │
└────────────────────────────┴────────────────────────────────────┘
            │                              │
            │ IPC (Unix Socket)            │ tmux capture-pane
            ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Claude AI (Controller)                     │
│                                                                 │
│  Receives:                    Sends:                            │
│  • terminalSnapshot           • sendKeys (navigation)           │
│  • runInfo (structured)       • getViewState                    │
│  • visibleMetrics             • refresh                         │
│  • systemMetrics              • update (config changes)         │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Spawn**: Claude spawns the W&B canvas with a run directory path
2. **Leet Launch**: Canvas spawns `wandb beta leet` in a tmux pane
3. **Capture Loop**: Every 1-2 seconds, capture Leet's terminal output
4. **Parse .wandb**: Extract structured metrics from local `.wandb` files
5. **Send viewState**: Combine visual + structured data, send to Claude via IPC
6. **Navigate**: Claude sends keystrokes to navigate Leet's interface

## Installation & Requirements

### Prerequisites

```bash
# W&B CLI with Leet feature (beta)
pip install wandb

# Verify Leet is available
wandb beta leet --help

# tmux (required for pane management)
brew install tmux  # macOS
apt install tmux   # Linux
```

### Canvas Dependencies

```bash
cd canvas
bun install
```

## Usage

### Starting the Canvas

```bash
# Spawn W&B canvas monitoring a run directory
bun run src/cli.ts spawn wandb --config '{"runDir": "./wandb/run-xxx"}'

# With custom refresh interval (ms)
bun run src/cli.ts spawn wandb --config '{"runDir": "./wandb/run-xxx", "refreshInterval": 1000}'
```

### CLI Commands

```bash
# Get current view state (what Claude sees)
bun run src/cli.ts wandb-viewstate <canvas-id>

# Send navigation keys to Leet
bun run src/cli.ts wandb-sendkeys <canvas-id> "Tab"
bun run src/cli.ts wandb-sendkeys <canvas-id> "Up"
bun run src/cli.ts wandb-sendkeys <canvas-id> "Down"
```

### Leet Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Switch between panels (runs, metrics, system) |
| `↑/↓` | Navigate lists |
| `←/→` | Adjust selection |
| `[` / `]` | Toggle sidebars |
| `/` | Filter metrics |
| `n` / `N` | Page through data |
| `q` | Quit |

## Testing

### Create a Test Run

```bash
# Run the included test script (logs for 3 minutes)
python test-wandb-run.py
```

This creates a W&B run that logs:
- `train/loss` - Decreasing loss curve
- `train/accuracy` - Increasing accuracy
- `val/loss` / `val/accuracy` - Validation metrics
- `gpu/utilization`, `gpu/memory` - Simulated system metrics
- `learning_rate` - With warmup and decay

### Test the Canvas

```bash
# In tmux session
tmux

# Start the test run (note the run directory it prints)
python test-wandb-run.py

# In another terminal, spawn the canvas
bun run src/cli.ts spawn wandb --config '{"runDir": "./wandb/latest-run"}'
```

## File Structure

```
canvas/src/
├── canvases/
│   ├── wandb.tsx                    # Main canvas component
│   └── wandb/
│       ├── types.ts                 # Type definitions
│       ├── components/
│       │   ├── leet-viewer.tsx      # Status display
│       │   └── status-bar.tsx       # Controls bar
│       ├── hooks/
│       │   └── use-leet-pane.ts     # Leet pane management
│       └── lib/
│           └── wandb-parser.ts      # .wandb file parser (TODO)
├── terminal.ts                      # Leet tmux functions
└── cli.ts                           # CLI commands
```

## API Reference

### WandbConfig

```typescript
interface WandbConfig {
  runDir: string;           // Path to run directory with .wandb folder
  title?: string;           // Custom title
  leetArgs?: string[];      // Additional args for wandb beta leet
  refreshInterval?: number; // Capture interval in ms (default: 2000)
}
```

### WandbViewState (sent to Claude)

```typescript
interface WandbViewState {
  // Visual representation
  terminalSnapshot: string;           // Raw Leet terminal output
  terminalDimensions: { cols: number; rows: number };

  // Structured data (from .wandb parsing)
  runInfo: {
    id: string;
    name: string;
    state: "running" | "finished" | "failed";
    config: Record<string, unknown>;
    summary: Record<string, number>;
  } | null;

  visibleMetrics: Array<{
    key: string;
    latestValue: number;
    trend: "up" | "down" | "stable";
    dataPoints: number;
  }>;

  systemMetrics?: {
    gpu?: { utilization: number; memory: number };
    cpu?: number;
    memory?: number;
  };

  leetPaneId: string | null;
  errors?: string[];
  lastUpdated: string;  // ISO timestamp
}
```

### IPC Messages

**Controller → Canvas:**
```typescript
{ type: "getViewState" }              // Request current state
{ type: "sendKeys", keys: string }    // Forward keystrokes to Leet
{ type: "refresh" }                   // Force data refresh
{ type: "update", config: WandbConfig } // Update configuration
{ type: "close" }                     // Close canvas
```

**Canvas → Controller:**
```typescript
{ type: "ready", scenario: string }
{ type: "viewState", data: WandbViewState }
{ type: "cancelled", reason?: string }
{ type: "error", message: string }
```

## Implementation Status

### ✅ Phase 1: Leet tmux Integration (Complete)

- [x] Spawn `wandb beta leet` in tmux pane
- [x] Capture terminal output via `tmux capture-pane`
- [x] Forward keystrokes via `tmux send-keys`
- [x] IPC communication with Claude
- [x] Status display and keyboard controls
- [x] CLI commands for viewstate and sendkeys

### 🚧 Phase 2: Structured Data Extraction (TODO)

- [ ] Parse `.wandb` LevelDB-style log files
- [ ] Extract run config and summary
- [ ] Extract metric history with trends
- [ ] Extract system metrics
- [ ] File watching for live updates

### 📋 Phase 3: Enhanced Claude Integration (TODO)

- [ ] Rich viewState with full metric data
- [ ] Metric trend analysis
- [ ] Run comparison support
- [ ] Export functionality

### 📚 Phase 4: Documentation & Polish (TODO)

- [ ] Skill documentation for Claude
- [ ] Scenario definitions (monitor, review, compare)
- [ ] Error handling improvements
- [ ] Performance optimization

## Known Limitations

1. **Requires tmux**: Canvas must run inside a tmux session
2. **Requires wandb beta leet**: The Leet feature is still in beta
3. **Local runs only**: Currently only supports local `.wandb` directories (no remote/API)
4. **Terminal output only**: Until Phase 2, Claude only sees the braille visualization, not structured data

## Troubleshooting

### "Leet requires tmux"
```bash
# Start a tmux session first
tmux new-session -s canvas
```

### "Failed to spawn Leet pane"
```bash
# Check if wandb leet is available
wandb beta leet --help

# Check if you're in tmux
echo $TMUX
```

### "wandb not found"
```bash
pip install wandb
wandb login  # Authenticate if needed
```

## References

- [W&B MCP Server](https://github.com/wandb/wandb-mcp-server) - For future API integration
- [W&B Leet PR](https://github.com/wandb/wandb/pull/10764) - Leet implementation details
- [Claude Canvas](../README.md) - Main canvas documentation
