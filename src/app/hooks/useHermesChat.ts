"use client";

import { useCallback, useRef, useState } from "react";

export interface HermesDelta {
  type: "text_delta" | "tool_call" | "tool_result" | "pending_approval" | "done" | "error";
  content?: string;
  tool_name?: string;
  tool_args?: string;
  tool_id?: string;
  approval_id?: string;
  approval_prompt?: string;
  error_message?: string;
}

export interface HermesMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls?: { id: string; name: string; args: string; result?: string }[];
  attachments?: { name: string; url?: string }[];
}

const HERMES_API_URL =
  process.env.NEXT_PUBLIC_HERMES_API_URL || "http://localhost:8642/v1";
const HERMES_API_KEY =
  process.env.NEXT_PUBLIC_HERMES_API_KEY || "sk-hermes-local";
const HERMES_MODEL =
  process.env.NEXT_PUBLIC_HERMES_MODEL || "hermes-agent";

const MAX_INLINE_BYTES = 100_000; // Text files up to ~100KB sent inline

function formatAttachmentMessage(
  userMessage: string,
  attachments: { name: string; url?: string }[]
): string {
  if (attachments.length === 0) return userMessage;
  const paths = attachments
    .map((a) => `[File: ${a.name} — ${a.url}]`)
    .join("\n");
  return `${userMessage}\n\nAttached files (use read_file to inspect):\n${paths}`;
}

function parseSSELine(line: string): HermesDelta | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6).trim();
  if (data === "[DONE]") return { type: "done" };

  try {
    const parsed = JSON.parse(data);
    const choice = parsed.choices?.[0];
    const delta = choice?.delta;

    if (delta?.content) {
      return { type: "text_delta", content: delta.content };
    }

    if (delta?.tool_calls) {
      const tc = delta.tool_calls[0];
      return {
        type: "tool_call",
        tool_id: tc.id,
        tool_name: tc.function?.name,
        tool_args: tc.function?.arguments,
      };
    }

    if (choice?.message?.tool_calls) {
      // Non-streaming tool call response
      const tc = choice.message.tool_calls[0];
      return {
        type: "tool_result",
        tool_id: tc.id,
        tool_name: tc.function?.name,
        content: choice.message.content || tc.function?.arguments,
      };
    }

    // Hermes approval event (custom SSE extension)
    if (parsed.pending_approval) {
      return {
        type: "pending_approval",
        approval_id: parsed.pending_approval.id,
        approval_prompt: parsed.pending_approval.prompt,
        tool_name: parsed.pending_approval.tool,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function useHermesChat() {
  const [messages, setMessages] = useState<HermesMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{
    id: string;
    prompt: string;
    tool: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (
      userMessage: string,
      attachments?: { name: string; content?: string; url?: string }[],
      systemPrompt?: string
    ) => {
      if (!userMessage.trim() || isStreaming) return;

      const fullContent = formatAttachmentMessage(userMessage, attachments || []);

      const userMsg: HermesMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: fullContent,
        attachments,
      };

      const assistantMsg: HermesMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        tool_calls: [],
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setPendingApproval(null);

      const controller = new AbortController();
      abortRef.current = controller;

      const payload: any = {
        model: HERMES_MODEL,
        messages: [
          ...(systemPrompt
            ? [{ role: "system", content: systemPrompt }]
            : []),
          ...messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          { role: "user", content: fullContent },
        ],
        stream: true,
      };

      try {
        const response = await fetch(
          `${HERMES_API_URL}/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${HERMES_API_KEY}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Hermes API error ${response.status}: ${err}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let currentContent = "";
        let currentToolCalls: NonNullable<HermesMessage["tool_calls"]> = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const delta = parseSSELine(line);
            if (!delta) continue;

            if (delta.type === "text_delta" && delta.content) {
              currentContent += delta.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: currentContent }
                    : m
                )
              );
            }

            if (delta.type === "tool_call") {
              currentToolCalls = [
                ...currentToolCalls,
                {
                  id: delta.tool_id || crypto.randomUUID(),
                  name: delta.tool_name || "unknown",
                  args: delta.tool_args || "",
                },
              ];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, tool_calls: [...currentToolCalls] }
                    : m
                )
              );
            }

            if (delta.type === "tool_result") {
              currentToolCalls = currentToolCalls.map((tc) =>
                tc.id === delta.tool_id
                  ? { ...tc, result: delta.content || "" }
                  : tc
              );
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, tool_calls: [...currentToolCalls] }
                    : m
                )
              );
            }

            if (delta.type === "pending_approval") {
              setPendingApproval({
                id: delta.approval_id || "",
                prompt: delta.approval_prompt || "",
                tool: delta.tool_name || "",
              });
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    content: m.content || `Error: ${err.message}`,
                  }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming]
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const approveAction = useCallback(
    async (approvalId: string) => {
      try {
        await fetch(`${HERMES_API_URL}/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${HERMES_API_KEY}`,
          },
          body: JSON.stringify({ approval_id: approvalId, action: "approve" }),
        });
        setPendingApproval(null);
      } catch (err) {
        console.error("Approval failed:", err);
      }
    },
    []
  );

  const denyAction = useCallback(
    async (approvalId: string) => {
      try {
        await fetch(`${HERMES_API_URL}/approve`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${HERMES_API_KEY}`,
          },
          body: JSON.stringify({ approval_id: approvalId, action: "deny" }),
        });
        setPendingApproval(null);
      } catch (err) {
        console.error("Deny failed:", err);
      }
    },
    []
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPendingApproval(null);
  }, []);

  return {
    messages,
    isStreaming,
    pendingApproval,
    sendMessage,
    cancelStream,
    approveAction,
    denyAction,
    clearMessages,
  };
}
