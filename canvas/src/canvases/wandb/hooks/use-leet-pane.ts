import { useState, useEffect, useCallback, useRef } from "react";
import {
  spawnLeetPane,
  captureLeetPane,
  sendKeysToLeet,
  killLeetPane,
  getLeetPaneId,
  isLeetPaneAlive,
} from "../../../terminal";
import type { LeetPaneState, WandbConfig } from "../types";

export interface UseLeetPaneOptions {
  config: WandbConfig;
  /** Interval in ms to capture Leet output (default: 1000) */
  captureInterval?: number;
  /** Called when Leet output is captured */
  onCapture?: (output: string) => void;
  /** Called when Leet pane exits */
  onExit?: () => void;
}

export interface UseLeetPaneReturn {
  /** Current state of the Leet pane */
  state: LeetPaneState;
  /** The latest captured output from Leet */
  output: string;
  /** Whether Leet is currently running */
  isRunning: boolean;
  /** Error message if any */
  error: string | null;
  /** Send keystrokes to Leet for navigation */
  sendKeys: (keys: string) => Promise<boolean>;
  /** Force a capture of the current Leet output */
  capture: () => Promise<string | null>;
  /** Restart Leet with current config */
  restart: () => Promise<void>;
  /** Stop Leet and kill the pane */
  stop: () => Promise<void>;
}

export function useLeetPane(options: UseLeetPaneOptions): UseLeetPaneReturn {
  const { config, captureInterval = 1000, onCapture, onExit } = options;

  const [state, setState] = useState<LeetPaneState>({
    paneId: null,
    isRunning: false,
    lastCapture: "",
    lastCaptureTime: null,
  });
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSpawningRef = useRef(false);

  // Spawn Leet on mount
  useEffect(() => {
    const spawn = async () => {
      if (isSpawningRef.current) return;
      isSpawningRef.current = true;

      try {
        setError(null);
        const paneId = await spawnLeetPane({
          runDir: config.runDir,
          leetArgs: config.leetArgs,
        });

        if (paneId) {
          setState((prev) => ({
            ...prev,
            paneId,
            isRunning: true,
          }));
        } else {
          setError("Failed to spawn Leet pane. Is wandb installed?");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to spawn Leet");
      } finally {
        isSpawningRef.current = false;
      }
    };

    spawn();

    // Cleanup on unmount
    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      killLeetPane();
    };
  }, [config.runDir, config.leetArgs]);

  // Set up capture interval when running
  useEffect(() => {
    if (!state.isRunning || !state.paneId) return;

    const doCapture = async () => {
      const captured = await captureLeetPane();
      if (captured !== null) {
        setOutput(captured);
        setState((prev) => ({
          ...prev,
          lastCapture: captured,
          lastCaptureTime: new Date(),
        }));
        onCapture?.(captured);
      } else {
        // Pane might have died
        const alive = await isLeetPaneAlive();
        if (!alive) {
          setState((prev) => ({
            ...prev,
            isRunning: false,
            paneId: null,
          }));
          onExit?.();
        }
      }
    };

    // Initial capture
    doCapture();

    // Set up interval
    captureIntervalRef.current = setInterval(doCapture, captureInterval);

    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
    };
  }, [state.isRunning, state.paneId, captureInterval, onCapture, onExit]);

  const sendKeys = useCallback(async (keys: string): Promise<boolean> => {
    if (!state.paneId) return false;
    return sendKeysToLeet(keys);
  }, [state.paneId]);

  const capture = useCallback(async (): Promise<string | null> => {
    const captured = await captureLeetPane();
    if (captured !== null) {
      setOutput(captured);
      setState((prev) => ({
        ...prev,
        lastCapture: captured,
        lastCaptureTime: new Date(),
      }));
    }
    return captured;
  }, []);

  const restart = useCallback(async (): Promise<void> => {
    await killLeetPane();
    setState({
      paneId: null,
      isRunning: false,
      lastCapture: "",
      lastCaptureTime: null,
    });
    setError(null);

    const paneId = await spawnLeetPane({
      runDir: config.runDir,
      leetArgs: config.leetArgs,
    });

    if (paneId) {
      setState({
        paneId,
        isRunning: true,
        lastCapture: "",
        lastCaptureTime: null,
      });
    } else {
      setError("Failed to restart Leet pane");
    }
  }, [config.runDir, config.leetArgs]);

  const stop = useCallback(async (): Promise<void> => {
    await killLeetPane();
    setState({
      paneId: null,
      isRunning: false,
      lastCapture: "",
      lastCaptureTime: null,
    });
  }, []);

  return {
    state,
    output,
    isRunning: state.isRunning,
    error,
    sendKeys,
    capture,
    restart,
    stop,
  };
}
