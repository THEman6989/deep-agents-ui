"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Ban,
  Check,
  Code2,
  FileText,
  Loader2,
  Paperclip,
  ShieldAlert,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/app/components/MarkdownContent";
import { useHermesChat } from "@/app/hooks/useHermesChat";
import { useHermesOrchestrated } from "@/app/hooks/useHermesOrchestrated";

const CODING_OPENERS = [
  "Explore the project structure and explain key modules",
  "Refactor the authentication module for better error handling",
  "Add unit tests for the API endpoints",
  "Debug why the build is failing",
  "Review this codebase for security issues",
  "Create a new feature branch and implement the changes",
];

function ToolCallCard({
  name,
  args,
  result,
}: {
  name: string;
  args: string;
  result?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasResult = result !== undefined;

  let argsDisplay = args;
  try {
    argsDisplay = JSON.stringify(JSON.parse(args), null, 2);
  } catch {}

  return (
    <div className="my-2 rounded-md border border-border bg-card/50 p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-left text-sm"
      >
        <Terminal className="h-4 w-4 text-[#47d7ac]" />
        <span className="font-mono text-xs font-medium text-[#47d7ac]">
          {name}
        </span>
        {hasResult && (
          <Check className="ml-auto h-3 w-3 text-success/60" />
        )}
        <Code2 className="h-3 w-3 text-muted-foreground" />
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          <pre className="max-h-32 overflow-auto rounded bg-black/20 p-2 text-xs text-muted-foreground">
            {argsDisplay}
          </pre>
          {hasResult && (
            <div className="rounded bg-black/10 p-2 text-xs text-muted-foreground">
              {result?.slice(0, 2000)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ApprovalBar({
  prompt,
  tool,
  onApprove,
  onDeny,
}: {
  prompt: string;
  tool: string;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="my-3 rounded-md border border-warning/30 bg-warning/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-warning" />
        <span className="text-sm font-semibold text-warning">
          Approval Required
        </span>
        <span className="rounded bg-warning/10 px-2 py-0.5 font-mono text-xs text-warning/80">
          {tool}
        </span>
      </div>
      <p className="mb-3 text-sm text-foreground/80">{prompt}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onApprove}
          className="bg-[#47d7ac] text-black hover:bg-[#47d7ac]/80"
        >
          <Check className="mr-1 h-4 w-4" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDeny}
          className="border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <Ban className="mr-1 h-4 w-4" />
          Deny
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: { id: string; role: string; content: string; tool_calls?: { id: string; name: string; args: string; result?: string }[]; artifact_key?: string } }) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";

  if (isSystem) return null;

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-2.5",
          isUser
            ? "bg-[#2F6868] text-white"
            : "bg-card border border-border text-foreground"
        )}
      >
        {msg.content && (
          <MarkdownContent content={msg.content} />
        )}
        {msg.tool_calls?.map((tc) => (
          <ToolCallCard
            key={tc.id}
            name={tc.name}
            args={tc.args}
            result={tc.result}
          />
        ))}
        {msg.artifact_key && (
          <div className="mt-2 text-xs text-muted-foreground">
            Artifact: {msg.artifact_key}
          </div>
        )}
      </div>
    </div>
  );
}

type HermesMode = "direct" | "orchestrated";

export function HermesPanel() {
  const [mode, setMode] = useState<HermesMode>("direct");

  // --- Direct mode hook (Weg A) ---
  const direct = useHermesChat();

  // --- Orchestrated mode hook (Weg B) ---
  const orch = useHermesOrchestrated();

  const sendMessage = useCallback(
    (userMessage: string, attachments?: any[]) => {
      if (mode === "direct") {
        direct.sendMessage(userMessage, attachments?.length ? attachments : undefined);
      } else {
        orch.sendMessage(userMessage);
      }
    },
    [mode, direct.sendMessage, orch.sendMessage]
  );

  const cancelStream = useCallback(() => {
    (mode === "direct" ? direct.cancelStream : orch.cancelStream)();
  }, [mode, direct.cancelStream, orch.cancelStream]);

  const clearMessages = useCallback(() => {
    (mode === "direct" ? direct.clearMessages : orch.clearMessages)();
  }, [mode, direct.clearMessages, orch.clearMessages]);

  const approveAction = useCallback(
    (approvalId: string) => direct.approveAction(approvalId),
    [direct.approveAction]
  );

  const denyAction = useCallback(
    (approvalId: string) => direct.denyAction(approvalId),
    [direct.denyAction]
  );

  const messages = mode === "direct" ? direct.messages : orch.messages;
  const isStreaming = mode === "direct" ? direct.isStreaming : orch.isStreaming;
  const pendingApproval = mode === "direct" ? direct.pendingApproval : orch.pendingApproval;

  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<
    { name: string; url?: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const newAttachments: { name: string; url?: string }[] = [];
      const uploadUrl =
        process.env.NEXT_PUBLIC_OFFICE_OUTPUT_UPLOAD_URL ||
        "http://localhost:8130/office/upload";

      for (const file of files) {
        try {
          const formData = new FormData();
          formData.append("file", file, file.name);
          const resp = await fetch(uploadUrl, {
            method: "POST",
            body: formData,
          });
          if (resp.ok) {
            const data = await resp.json();
            const workspacePath =
              data.workspace_path ||
              data.path ||
              `/workspace/office-output/${file.name}`;
            newAttachments.push({ name: file.name, url: workspacePath });
          } else {
            // Fallback: assume it lands in office-output
            newAttachments.push({
              name: file.name,
              url: `/workspace/office-output/${file.name}`,
            });
          }
        } catch {
          newAttachments.push({
            name: file.name,
            url: `/workspace/office-output/${file.name}`,
          });
        }
      }

      setAttachedFiles((prev) => [...prev, ...newAttachments]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    []
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (!input.trim() || isStreaming) return;
      sendMessage(input.trim(), attachedFiles.length > 0 ? attachedFiles : undefined);
      setInput("");
      setAttachedFiles([]);
    },
    [input, isStreaming, sendMessage, attachedFiles]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
            <Terminal className="h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">Hermes Coding Agent</p>
            <p className="max-w-md text-center text-sm">
              {mode === "direct"
                ? "Direct access to Hermes. Code, debug, refactor — bare SSE, no AlphaRavis overhead."
                : "Orchestrated via AlphaRavis. Pre-loaded Memory/RAG/Skills, auto-artifact save."}
            </p>
            {/* Mode selector */}
            <div className="flex items-center gap-2 rounded-lg bg-card border border-border p-1">
              <Button
                size="sm"
                variant={mode === "direct" ? "secondary" : "ghost"}
                onClick={() => setMode("direct")}
                className="h-7 text-xs px-3"
              >
                Hermes Direct
              </Button>
              <Button
                size="sm"
                variant={mode === "orchestrated" ? "secondary" : "ghost"}
                onClick={() => setMode("orchestrated")}
                className="h-7 text-xs px-3"
              >
                + AlphaRavis
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CODING_OPENERS.map((opener) => (
                <Button
                  key={opener}
                  variant="outline"
                  size="sm"
                  className="h-auto whitespace-normal py-2 text-left text-xs"
                  onClick={() => {
                    setInput(opener);
                    inputRef.current?.focus();
                  }}
                >
                  {opener}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {pendingApproval && (
              <ApprovalBar
                prompt={pendingApproval.prompt}
                tool={pendingApproval.tool}
                onApprove={() => approveAction(pendingApproval.id)}
                onDeny={() => denyAction(pendingApproval.id)}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-background p-4">
        {/* Mode switch + status bar */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1 rounded bg-card border border-border p-0.5">
            <button
              onClick={() => setMode("direct")}
              className={`px-2 py-0.5 text-xs rounded ${mode === "direct" ? "bg-[#2F6868] text-white" : "text-muted-foreground hover:text-foreground"}`}
              disabled={isStreaming}
            >
              Direct
            </button>
            <button
              onClick={() => setMode("orchestrated")}
              className={`px-2 py-0.5 text-xs rounded ${mode === "orchestrated" ? "bg-[#2F6868] text-white" : "text-muted-foreground hover:text-foreground"}`}
              disabled={isStreaming}
            >
              +AlphaRavis
            </button>
          </div>
          {mode === "orchestrated" && orch.artifactKey && (
            <span className="text-xs text-muted-foreground">
              Artifact: {orch.artifactKey}
            </span>
          )}
          {isStreaming && mode === "orchestrated" && (
            <span className="text-xs text-[#47d7ac]">Pre-loaded context → Hermes</span>
          )}
        </div>
        {/* Attachment previews */}
        {attachedFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachedFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-1 rounded bg-card border border-border px-2 py-1 text-xs"
              >
                <FileText className="h-3 w-3 text-[#47d7ac]" />
                <span className="max-w-[120px] truncate">{f.name}</span>
                <button
                  onClick={() => removeAttachment(i)}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            className="h-10 w-10 text-muted-foreground hover:text-foreground"
            disabled={isStreaming}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Hermes to code, debug, or explore..."
              rows={2}
              className="min-h-[44px] resize-none bg-card"
              disabled={isStreaming}
            />
          </div>
          <div className="flex gap-1">
            {isStreaming ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={cancelStream}
                className="h-10 w-10 border-destructive/30 text-destructive"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim()}
                className="h-10 w-10 bg-[#47d7ac] text-black hover:bg-[#47d7ac]/80"
              >
                <ArrowUp className="h-5 w-5" />
              </Button>
            )}
            {messages.length > 0 && !isStreaming && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={clearMessages}
                className="h-10 w-10 text-muted-foreground"
                title="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
        {isStreaming && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Hermes is working...
          </div>
        )}
      </div>
    </div>
  );
}
