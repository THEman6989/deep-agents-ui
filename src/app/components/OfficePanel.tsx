"use client";

import React, { FormEvent, useMemo, useState } from "react";
import { FileText, Presentation, Send, Table2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useChatContext } from "@/providers/useChatContext";
import { cn } from "@/lib/utils";

type OfficeKind = "pptx" | "docx" | "xlsx";

const OFFICE_OUTPUT_DIR = "/workspace/office-output";
const PREVIEW_URL =
  process.env.NEXT_PUBLIC_OFFICE_PREVIEW_URL || "http://localhost:26315";

const OFFICE_TYPES: Record<
  OfficeKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; hint: string }
> = {
  pptx: {
    label: "PowerPoint (.pptx)",
    icon: Presentation,
    hint: "slides, speaker notes, layout checks",
  },
  docx: {
    label: "Word (.docx)",
    icon: FileText,
    hint: "report, proposal, form, article",
  },
  xlsx: {
    label: "Excel (.xlsx)",
    icon: Table2,
    hint: "spreadsheet, dashboard, model",
  },
};

function safeSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "office-document";
}

export const OfficePanel = React.memo(function OfficePanel() {
  const { files, isLoading, sendMessage } = useChatContext();
  const [kind, setKind] = useState<OfficeKind>("pptx");
  const [title, setTitle] = useState("AlphaRavis Office Document");
  const [instructions, setInstructions] = useState(
    "Erstelle ein sauberes Dokument, prüfe es mit OfficeCLI view/issues/validate und speichere das Ergebnis im Office output directory."
  );

  const fileEntries = useMemo(
    () => Object.entries(files ?? {}).filter(([name]) => /\.(docx|pptx|xlsx)$/i.test(name)),
    [files]
  );

  const selected = OFFICE_TYPES[kind];
  const Icon = selected.icon;
  const outputPath = `${OFFICE_OUTPUT_DIR}/${safeSlug(title)}.${kind}`;

  const submitCreateRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = [
      `Nutze OfficeCLI, um ein Office-Dokument zu erstellen: ${selected.label}.`,
      `Zielpfad: ${outputPath}`,
      `Anforderungen: ${instructions.trim() || "Keine zusätzlichen Anforderungen."}`,
      "Vorgehen: officecli create, add/set Inhalte, view outline/issues, bei Bedarf screenshot/html, dann officecli validate.",
      "Wenn Live Preview nötig ist, nutze officecli watch auf Port 26315 und nenne die Preview-URL.",
    ].join("\n");
    sendMessage(message);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Office</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create with OfficeCLI: DOCX, PPTX, XLSX in {OFFICE_OUTPUT_DIR}.
            </p>
          </div>
          <a
            href={PREVIEW_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Eye className="h-4 w-4" />
            Live Preview
          </a>
        </div>
      </div>

      <div className="grid flex-1 gap-4 overflow-auto p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form
          onSubmit={submitCreateRequest}
          className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#2F6868]/20 p-3 text-[#7dd3c7]">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">Create Office document</h3>
              <p className="text-sm text-muted-foreground">{selected.hint}</p>
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Document type</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as OfficeKind)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {Object.entries(OFFICE_TYPES).map(([value, option]) => (
                <option key={value} value={value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Title / file name</span>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">Instructions for the agent</span>
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              className="min-h-36 resize-y"
            />
          </label>

          <div className="rounded-lg border border-border bg-background/60 p-3 text-sm text-muted-foreground">
            Output path: <span className="font-mono text-foreground">{outputPath}</span>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="border-[#2F6868] bg-[#2F6868] text-white hover:bg-[#2F6868]/80"
          >
            <Send className="mr-2 h-4 w-4" />
            Ask agent to create with OfficeCLI
          </Button>
        </form>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="font-medium text-foreground">Recent Office files</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Files reported by the LangGraph state appear here.
            </p>
            <div className="mt-4 space-y-2">
              {fileEntries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No Office files in this thread yet.
                </div>
              ) : (
                fileEntries.map(([name, path]) => (
                  <div
                    key={`${name}-${path}`}
                    className={cn(
                      "rounded-lg border border-border bg-background/60 p-3",
                      "text-sm text-muted-foreground"
                    )}
                  >
                    <div className="font-medium text-foreground">{name}</div>
                    <div className="mt-1 break-all font-mono text-xs">{path}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
            <h3 className="font-medium text-foreground">Runtime checklist</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Feature flag: ALPHARAVIS_ENABLE_OFFICECLI=true</li>
              <li>Container binary: officecli --version</li>
              <li>Live preview: officecli watch &lt;file&gt; --port 26315</li>
              <li>MCP optional: ALPHARAVIS_ENABLE_OFFICECLI_MCP=false by default</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
});
