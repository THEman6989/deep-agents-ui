"use client";

import React, { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Camera,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  FileType2,
  Presentation,
  Send,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useChatContext } from "@/providers/useChatContext";
import { cn } from "@/lib/utils";

type OfficeKind = "pptx" | "docx" | "xlsx";

const OFFICE_OUTPUT_DIR = "/workspace/office-output";
const PREVIEW_URL =
  process.env.NEXT_PUBLIC_OFFICE_PREVIEW_URL || "http://localhost:26315";
const OUTPUT_FILES_URL =
  process.env.NEXT_PUBLIC_OFFICE_OUTPUT_FILES_URL || "http://localhost:8130/office/files";

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

interface OfficeOutputFile {
  filename: string;
  relative_path: string;
  extension: string;
  size: number;
  modified_at: number;
  public_url: string;
  download_url: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const EXTENSION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  ".docx": FileText,
  ".pptx": Presentation,
  ".xlsx": FileSpreadsheet,
};

export const OfficePanel = React.memo(function OfficePanel() {
  const { isLoading, sendMessage } = useChatContext();
  const [kind, setKind] = useState<OfficeKind>("pptx");
  const [title, setTitle] = useState("AlphaRavis Office Document");
  const [instructions, setInstructions] = useState(
    "Erstelle ein sauberes Dokument, prüfe es mit OfficeCLI view/issues/validate und speichere das Ergebnis im Office output directory."
  );
  const [outputFiles, setOutputFiles] = useState<OfficeOutputFile[]>([]);
  const [outputFetchError, setOutputFetchError] = useState<string | null>(null);
  const [outputFetching, setOutputFetching] = useState(false);

  const fetchOutputFiles = useCallback(async () => {
    setOutputFetching(true);
    setOutputFetchError(null);
    try {
      const res = await fetch(OUTPUT_FILES_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOutputFiles((data.files as OfficeOutputFile[]) ?? []);
    } catch (err: unknown) {
      setOutputFetchError(err instanceof Error ? err.message : "fetch failed");
      setOutputFiles([]);
    } finally {
      setOutputFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchOutputFiles();
  }, [fetchOutputFiles]);

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

  const handleScreenshot = (file: OfficeOutputFile) => {
    const screenshotDir = "/workspace/office-output";
    const base = file.filename.replace(/\.[^.]+$/, "");
    const message = [
      `Generiere einen Screenshot des Office-Dokuments mit OfficeCLI.`,
      `Datei: ${screenshotDir}/${file.filename}`,
      `Befehl: officecli view ${screenshotDir}/${file.filename} screenshot -o ${screenshotDir}/${base}-preview`,
      `Speichere das PNG unter ${screenshotDir}/${base}-preview.png und bestätige den Dateipfad.`,
      `Falls mehrere Seiten: nutze --page 1-3 oder --page all für alle Seiten.`,
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
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={OUTPUT_FILES_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <FileText className="h-4 w-4" />
              Output files
            </a>
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
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Output files</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generated documents from /workspace/office-output.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchOutputFiles}
                disabled={outputFetching}
                className="h-8 text-xs"
              >
                {outputFetching ? "…" : "Refresh"}
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {outputFetchError ? (
                <div className="rounded-lg border border-dashed border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">
                  Could not load output files: {outputFetchError}
                </div>
              ) : outputFiles.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  {outputFetching
                    ? "Loading…"
                    : "No Office files generated yet. Use the form to create one."}
                </div>
              ) : (
                outputFiles.map((file) => {
                  const ExtIcon = EXTENSION_ICON[file.extension] ?? FileType2;
                  return (
                    <div
                      key={file.relative_path}
                      className={cn(
                        "rounded-lg border border-border bg-background/60 p-3",
                        "text-sm"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0 rounded bg-[#2F6868]/15 p-1.5 text-[#7dd3c7]">
                          <ExtIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">
                            {file.filename}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>{formatSize(file.size)}</span>
                            <span>{formatDate(file.modified_at)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleScreenshot(file)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          <Camera className="h-3 w-3" />
                          Screenshot
                        </button>
                        <a
                          href={file.download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </a>
                        <a
                          href={file.public_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </a>
                      </div>
                    </div>
                  );
                })
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
