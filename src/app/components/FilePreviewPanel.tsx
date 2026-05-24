"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { X, FileText, Code, Eye, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/app/components/MarkdownContent";
import { DiffViewer } from "@/app/components/DiffViewer";
import { isDiffContent } from "@/lib/diff-utils";

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

interface CodePreviewGateProps {
  file: FilePreviewTab;
  editorOpen: boolean;
  onToggleEditor: () => void;
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

function formatByteLength(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CodePreviewGate({ file, editorOpen, onToggleEditor }: CodePreviewGateProps) {
  if (editorOpen) {
    return (
      <div className="flex h-full min-h-[320px] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          <span className="truncate">
            Monaco editor · {file.language ?? "text"} · {formatByteLength(file.content)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleEditor}
            className="h-7 gap-1.5"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            Simple preview
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <CodeEditorLazy content={file.content} language={file.language ?? "plaintext"} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="truncate">
          Lightweight code preview · {file.language ?? "text"} · {formatByteLength(file.content)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onToggleEditor}
          className="h-7 gap-1.5"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Open Monaco editor
        </Button>
      </div>
      <pre className="m-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-foreground">
        {file.content}
      </pre>
    </div>
  );
}

export const FilePreviewPanel = React.memo<FilePreviewPanelProps>(
  ({ files, isOpen, onClose, className }) => {
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [editorOpenByFileId, setEditorOpenByFileId] = useState<Record<string, boolean>>({});

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

    const toggleEditorForFile = (fileId: string) => {
      setEditorOpenByFileId((current) => ({
        ...current,
        [fileId]: !current[fileId],
      }));
    };

    const renderContent = (file: FilePreviewTab) => {
      // Diff content stays lightweight for patch preview / agent change review.
      if (isDiffContent(file.content)) {
        return <DiffViewer content={file.content} maxLines={500} />;
      }

      // Markdown stays as rendered markdown, not Monaco.
      if (file.language === "markdown") {
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none px-4 py-2">
            <MarkdownContent content={file.content} />
          </div>
        );
      }

      // Code uses a cheap text preview by default. Monaco is loaded only after
      // the user explicitly presses the editor button for this file.
      if (file.language && file.language !== "diff") {
        return (
          <CodePreviewGate
            file={file}
            editorOpen={Boolean(editorOpenByFileId[file.id])}
            onToggleEditor={() => toggleEditorForFile(file.id)}
          />
        );
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
        <div className="min-h-0 flex-1 overflow-auto">
          {activeFile && renderContent(activeFile)}
        </div>
      </div>
    );
  }
);

FilePreviewPanel.displayName = "FilePreviewPanel";

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
