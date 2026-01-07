import React from "react";
import { Box, Text } from "ink";

export interface StatusBarProps {
  /** Whether Leet is running */
  isRunning: boolean;
  /** Last update timestamp */
  lastUpdated: Date | null;
  /** Width of the status bar */
  width?: number;
}

export function StatusBar({ isRunning, lastUpdated, width }: StatusBarProps) {
  const formatTime = (date: Date | null) => {
    if (!date) return "never";
    return date.toLocaleTimeString();
  };

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      width={width}
      paddingX={1}
      borderStyle="single"
      borderColor="gray"
    >
      <Box>
        <Text color="gray">Status: </Text>
        <Text color={isRunning ? "green" : "yellow"}>
          {isRunning ? "Running" : "Stopped"}
        </Text>
      </Box>

      <Box>
        <Text color="gray">Updated: </Text>
        <Text>{formatTime(lastUpdated)}</Text>
      </Box>

      <Box>
        <Text color="gray">
          q: quit | r: restart | Tab: focus leet | Arrow keys: navigate
        </Text>
      </Box>
    </Box>
  );
}
