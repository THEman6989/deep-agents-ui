"use client";

import React, { useState, useCallback, useMemo } from "react";
import { X, FileText, Code, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/app/components/MarkdownContent";
import { DiffViewer, isDiffContent } from "@/app/components/DiffViewer";

interface FilePreviewTab {
  id: string;
  name: string;
  content: string;
  language?: string;
}

interface FilePreviewPanelProps {
  files: Record<string, string>;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

function detectLanguage(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    css: "css",
    html: "html",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    markdown: "markdown",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    xml: "xml",
    toml: "toml",
    diff: "diff",
    patch: "diff",
  };
  return map[ext || ""];
}

export const FilePreviewPanel = React.memo<FilePreviewPanelProps>(
  ({ files, isOpen, onClose, className }) => {
    const [activeFileId, setActiveFileId] = useState<string | null>(null);

    const fileEntries = useMemo(() => {
      return Object.entries(files).map(([name, content]) => ({
        id: name,
        name,
        content,
        language: detectLanguage(name),
      }));
    }, [files]);

    // Close if no files
    if (fileEntries.length === 0 && isOpen) {
      return null;
    }

    const activeFile = fileEntries.find((f) => f.id === activeFileId) || fileEntries[0];

    const renderContent = (file: FilePreviewTab) => {
      // Diff content
      if (isDiffContent(file.content)) {
        return <DiffViewer content={file.content} maxLines={500} />;
      }

      // Markdown
      if (file.language === "markdown") {
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none px-4 py-2">
            <MarkdownContent content={file.content} />
          </div>
        );
      }

      // Code (Monaco is loaded dynamically below for performance)
      if (file.language && file.language !== "diff") {
        return <CodeEditorLazy content={file.content} language={file.language} />;
      }

      // Raw text
      return (
        <pre className="m-0 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-foreground">
          {file.content}
        </pre>
      );
    };

    if (!isOpen || fileEntries.length === 0) return null;

    return (
      <div
        className={cn(
          "flex h-full flex-col border-l border-border bg-background",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {fileEntries.map((file) => (
              <button
                key={file.id}
                onClick={() => setActiveFileId(file.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                  (activeFile?.id || fileEntries[0]?.id) === file.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                {file.language === "markdown" ? (
                  <Eye className="h-3 w-3" />
                ) : file.language ? (
                  <Code className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                <span className="max-w-[120px] truncate">{file.name}</span>
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 flex-shrink-0"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeFile && renderContent(activeFile)}
        </div>
      </div>
    );
  }
);

FilePreviewPanel.displayName = "FilePreviewPanel";

// Lazy-loaded Monaco editor to avoid heavy bundle on first load
import dynamic from "next/dynamic";

const CodeEditorLazy = dynamic(
  () =>
    import("@monaco-editor/react").then((mod) => {
      const Editor = mod.default;
      return function CodeEditor({
        content,
        language,
      }: {
        content: string;
        language: string;
      }) {
        return (
          <Editor
            height="100%"
            language={language}
            value={content}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
            }}
          />
        );
      };
    }),
  {
    ssr: false,
    loading: () => (
      <pre className="m-0 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs text-muted-foreground">
        Loading editor...
      </pre>
    ),
  }
);
