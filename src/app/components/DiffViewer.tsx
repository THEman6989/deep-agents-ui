"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

interface DiffViewerProps {
  content: string;
  className?: string;
  maxLines?: number;
}

interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
}

function parseUnifiedDiff(text: string): DiffLine[] {
  const lines = text.split("\n");
  const result: DiffLine[] = [];

  for (const line of lines) {
    if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("@@")) {
      result.push({ type: "header", content: line });
    } else if (line.startsWith("+")) {
      result.push({ type: "add", content: line });
    } else if (line.startsWith("-")) {
      result.push({ type: "remove", content: line });
    } else {
      result.push({ type: "context", content: line });
    }
  }

  return result;
}

export const DiffViewer = React.memo<DiffViewerProps>(
  ({ content, className, maxLines = 200 }) => {
    const lines = useMemo(() => {
      const parsed = parseUnifiedDiff(content);
      if (parsed.length > maxLines) {
        const half = Math.floor(maxLines / 2);
        return [
          ...parsed.slice(0, half),
          {
            type: "header" as const,
            content: `... ${parsed.length - maxLines} more lines truncated ...`,
          },
          ...parsed.slice(parsed.length - half),
        ];
      }
      return parsed;
    }, [content, maxLines]);

    if (lines.length === 0) {
      return (
        <pre className={cn("text-xs text-muted-foreground p-2", className)}>
          {content}
        </pre>
      );
    }

    return (
      <div
        className={cn(
          "overflow-x-auto rounded-md border border-border bg-muted/30 font-mono text-xs leading-relaxed",
          className
        )}
      >
        <div className="min-w-max">
          {lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                "px-3 py-0.5 whitespace-pre",
                line.type === "add" &&
                  "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300",
                line.type === "remove" &&
                  "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300",
                line.type === "header" &&
                  "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-semibold",
                line.type === "context" && "text-muted-foreground"
              )}
            >
              {line.content || " "}
            </div>
          ))}
        </div>
      </div>
    );
  }
);

DiffViewer.displayName = "DiffViewer";
