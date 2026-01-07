import React from "react";
import { Box, Text } from "ink";

export interface LeetViewerProps {
  /** The captured terminal output from Leet */
  output: string;
  /** Whether Leet is currently running */
  isRunning: boolean;
  /** Error message to display */
  error: string | null;
  /** Width of the viewer */
  width?: number;
  /** Height of the viewer */
  height?: number;
}

/**
 * Component that displays the captured output from wandb leet
 * Since Leet runs in its own tmux pane, this component shows status info
 * rather than trying to render Leet's output directly
 */
export function LeetViewer({
  output,
  isRunning,
  error,
  width,
  height,
}: LeetViewerProps) {
  if (error) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="red"
        paddingX={1}
        width={width}
        height={height}
      >
        <Text color="red" bold>
          Error
        </Text>
        <Text color="red">{error}</Text>
        <Text color="gray" dimColor>
          Make sure wandb is installed: pip install wandb
        </Text>
      </Box>
    );
  }

  if (!isRunning) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        width={width}
        height={height}
      >
        <Text color="yellow" bold>
          Leet Not Running
        </Text>
        <Text color="gray" dimColor>
          Press 'r' to restart
        </Text>
      </Box>
    );
  }

  // When Leet is running in another pane, show status
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      width={width}
      height={height}
    >
      <Text color="green" bold>
        wandb leet running
      </Text>
      <Text color="gray" dimColor>
        View visualization in the right pane
      </Text>
      <Box marginTop={1}>
        <Text color="cyan">Output captured: </Text>
        <Text>{output ? `${output.split("\n").length} lines` : "waiting..."}</Text>
      </Box>
    </Box>
  );
}

/**
 * Preview of the Leet output (first few lines)
 * Useful for showing a snippet in the canvas
 */
export function LeetPreview({
  output,
  maxLines = 10,
}: {
  output: string;
  maxLines?: number;
}) {
  const lines = output.split("\n").slice(0, maxLines);

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      {output.split("\n").length > maxLines && (
        <Text color="gray" dimColor>
          ... {output.split("\n").length - maxLines} more lines
        </Text>
      )}
    </Box>
  );
}
