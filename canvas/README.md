# Canvas Plugin

Interactive terminal TUI components for Claude Code.

## Quick Start: W&B Visualization

Visualize W&B runs directly in your terminal (requires tmux):

```bash
cd canvas

# Spawn wandb leet for your latest run
bun run src/cli.ts leet ../wandb/latest-run

# Capture the visualization output
bun run src/cli.ts leet-capture

# Navigate with keys (Tab, Up, Down, etc.)
bun run src/cli.ts leet-keys Tab

# Clean up when done
bun run src/cli.ts leet-kill
```

See [WANDB_LEET_FEATURE.md](./WANDB_LEET_FEATURE.md) for full documentation.

---

## Overview

Canvas provides spawnable terminal displays (calendars, documents, flight booking) with real-time IPC communication. Claude can spawn these TUIs in tmux split panes and receive user selections.

## Canvas Types

| Type | Description |
|------|-------------|
| `calendar` | Display events, pick meeting times |
| `document` | View/edit markdown documents |
| `flight` | Compare flights and select seats |
| `wandb` | Visualize W&B runs with wandb leet |

## Installation

```bash
# Add as Claude Code plugin
claude --plugin-dir /path/to/claude-canvas/canvas

# Or via marketplace
/plugin marketplace add djsiegel/claude-canvas
/plugin install claude-canvas@canvas
```

## Usage

```bash
# Show calendar in current terminal
bun run src/cli.ts show calendar

# Spawn meeting picker in tmux split
bun run src/cli.ts spawn calendar --scenario meeting-picker --config '{"calendars": [...]}'

# Spawn document editor
bun run src/cli.ts spawn document --scenario edit --config '{"content": "# Hello"}'

# W&B Leet visualization (simple mode - recommended)
bun run src/cli.ts leet ./wandb/latest-run        # Spawn leet in tmux pane
bun run src/cli.ts leet-capture                    # Capture current output
bun run src/cli.ts leet-keys Tab                   # Send navigation keys
bun run src/cli.ts leet-kill                       # Kill pane
```

See [WANDB_LEET_FEATURE.md](./WANDB_LEET_FEATURE.md) for detailed W&B integration docs.

## Commands

- `/canvas` - Interactive canvas spawning

## Skills

- `canvas` - Main skill with overview and IPC details
- `calendar` - Calendar display and meeting picker
- `document` - Markdown rendering and text selection
- `flight` - Flight comparison and seatmaps

## Requirements

- **tmux** - Canvas spawning requires a tmux session
- **Bun** - Runtime for CLI commands
- **Terminal with mouse support** - For interactive scenarios

## License

MIT
