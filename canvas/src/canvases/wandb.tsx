// W&B Canvas - Wrapper for wandb leet visualization
// Spawns wandb leet in a tmux pane and provides Claude with structured data

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { useLeetPane } from "./wandb/hooks/use-leet-pane";
import { LeetViewer } from "./wandb/components/leet-viewer";
import { StatusBar } from "./wandb/components/status-bar";
import { connectWithRetry, type IPCClient } from "../ipc/client";
import type { ControllerMessage } from "../ipc/types";
import type {
  WandbConfig,
  WandbViewState,
  WandbControllerMessage,
} from "./wandb/types";

interface Props {
  id: string;
  config?: WandbConfig;
  socketPath?: string;
  scenario?: string;
}

export function WandbCanvas({
  id,
  config: initialConfig,
  socketPath,
  scenario = "monitor",
}: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Terminal dimensions
  const [dimensions, setDimensions] = useState({
    width: stdout?.columns || 120,
    height: stdout?.rows || 40,
  });

  // Config (can be updated via IPC)
  const [config, setConfig] = useState<WandbConfig | undefined>(initialConfig);

  // IPC client reference
  const clientRef = useRef<IPCClient | null>(null);

  // Leet pane hook
  const leetPane = useLeetPane({
    config: config || { runDir: "." },
    captureInterval: config?.refreshInterval || 2000,
    onCapture: (output) => {
      // Send view state update to Claude
      sendViewState(output);
    },
    onExit: () => {
      // Leet exited, notify controller
      clientRef.current?.send({
        type: "cancelled",
        reason: "Leet process exited",
      });
    },
  });

  // Build and send view state to Claude
  const sendViewState = useCallback(
    (terminalOutput: string) => {
      if (!clientRef.current) return;

      const viewState: WandbViewState = {
        terminalSnapshot: terminalOutput,
        terminalDimensions: { cols: dimensions.width, rows: dimensions.height },
        runInfo: null, // TODO: Parse from .wandb files
        visibleMetrics: [], // TODO: Extract from .wandb files
        leetPaneId: leetPane.state.paneId,
        lastUpdated: new Date().toISOString(),
      };

      if (leetPane.error) {
        viewState.errors = [leetPane.error];
      }

      clientRef.current.send({
        type: "viewState" as any,
        data: viewState,
      });
    },
    [dimensions, leetPane.state.paneId, leetPane.error]
  );

  // Listen for terminal resize
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: stdout?.columns || 120,
        height: stdout?.rows || 40,
      });
    };
    stdout?.on("resize", updateDimensions);
    updateDimensions();
    return () => {
      stdout?.off("resize", updateDimensions);
    };
  }, [stdout]);

  // Connect to controller
  useEffect(() => {
    if (!socketPath) return;

    let mounted = true;

    const connect = async () => {
      try {
        const client = await connectWithRetry({
          socketPath,
          onMessage: (msg: ControllerMessage | WandbControllerMessage) => {
            switch (msg.type) {
              case "close":
                leetPane.stop();
                exit();
                break;
              case "update":
                setConfig(msg.config as WandbConfig);
                break;
              case "ping":
                client.send({ type: "pong" });
                break;
              case "getViewState":
                sendViewState(leetPane.output);
                break;
              case "sendKeys":
                leetPane.sendKeys((msg as any).keys);
                break;
              case "refresh":
                leetPane.capture();
                break;
            }
          },
          onDisconnect: () => {
            // Controller disconnected
          },
          onError: (err) => {
            console.error("IPC error:", err);
          },
        });

        if (mounted) {
          clientRef.current = client;
          // Send ready message
          client.send({ type: "ready", scenario });
          // Send initial view state after a delay to let Leet start
          setTimeout(() => sendViewState(leetPane.output), 1000);
        } else {
          client.close();
        }
      } catch (err) {
        console.error("Failed to connect to controller:", err);
      }
    };

    connect();

    return () => {
      mounted = false;
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, [socketPath, scenario, exit]);

  // Keyboard input
  useInput((input, key) => {
    // Quit
    if (input === "q" || (key.ctrl && input === "c")) {
      leetPane.stop();
      clientRef.current?.send({ type: "cancelled", reason: "User quit" });
      exit();
      return;
    }

    // Restart Leet
    if (input === "r") {
      leetPane.restart();
      return;
    }

    // Pass navigation keys to Leet
    if (key.tab) {
      leetPane.sendKeys("Tab");
    } else if (key.upArrow) {
      leetPane.sendKeys("Up");
    } else if (key.downArrow) {
      leetPane.sendKeys("Down");
    } else if (key.leftArrow) {
      leetPane.sendKeys("Left");
    } else if (key.rightArrow) {
      leetPane.sendKeys("Right");
    } else if (input === "[") {
      leetPane.sendKeys("[");
    } else if (input === "]") {
      leetPane.sendKeys("]");
    } else if (input === "/") {
      leetPane.sendKeys("/");
    } else if (input === "n") {
      leetPane.sendKeys("n");
    } else if (input === "N") {
      leetPane.sendKeys("N");
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      leetPane.stop();
    };
  }, []);

  const headerHeight = 3;
  const statusHeight = 3;
  const contentHeight = Math.max(1, dimensions.height - headerHeight - statusHeight);

  return (
    <Box
      flexDirection="column"
      width={dimensions.width}
      height={dimensions.height}
    >
      {/* Header */}
      <Box
        borderStyle="double"
        borderColor="cyan"
        paddingX={1}
        height={headerHeight}
      >
        <Text color="cyan" bold>
          W&B Canvas
        </Text>
        <Text color="gray"> | </Text>
        <Text color="white">{config?.title || config?.runDir || "No run specified"}</Text>
      </Box>

      {/* Main content area */}
      <Box height={contentHeight} flexDirection="row">
        {/* Left panel - Canvas status and info */}
        <Box
          flexDirection="column"
          width="100%"
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          <LeetViewer
            output={leetPane.output}
            isRunning={leetPane.isRunning}
            error={leetPane.error}
          />

          {leetPane.isRunning && (
            <Box marginTop={1} flexDirection="column">
              <Text color="cyan" bold>
                Leet Running in Right Pane
              </Text>
              <Text color="gray" dimColor>
                The wandb leet visualization is displayed in the tmux pane to the right.
              </Text>
              <Text color="gray" dimColor>
                Claude receives periodic snapshots of the visualization.
              </Text>

              <Box marginTop={1}>
                <Text color="yellow">Keyboard Controls:</Text>
              </Box>
              <Text color="gray">  Tab     - Switch panels in Leet</Text>
              <Text color="gray">  Arrows  - Navigate</Text>
              <Text color="gray">  [ / ]   - Toggle sidebars</Text>
              <Text color="gray">  /       - Filter metrics</Text>
              <Text color="gray">  n / N   - Page through data</Text>
              <Text color="gray">  r       - Restart Leet</Text>
              <Text color="gray">  q       - Quit</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Status bar */}
      <StatusBar
        isRunning={leetPane.isRunning}
        lastUpdated={leetPane.state.lastCaptureTime}
        width={dimensions.width}
      />
    </Box>
  );
}

export type { WandbConfig } from "./wandb/types";
