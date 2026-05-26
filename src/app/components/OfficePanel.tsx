"use client";

import React, { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  FileType2,
  MonitorPlay,
  MonitorStop,
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
const OUTPUT_UPLOAD_URL =
  process.env.NEXT_PUBLIC_OFFICE_OUTPUT_UPLOAD_URL || "http://localhost:8130/office/upload";
const MEDIA_GALLERY_UPLOAD_URL =
  process.env.NEXT_PUBLIC_MEDIA_GALLERY_UPLOAD_URL || "http://localhost:8130/api/assets/upload";
const TEMPLATES_URL =
  process.env.NEXT_PUBLIC_OFFICE_TEMPLATES_URL || "http://localhost:8130/office/templates";
const TEMPLATE_MERGE_URL =
  process.env.NEXT_PUBLIC_OFFICE_TEMPLATE_MERGE_URL || "http://localhost:8130/office/template-merge";
const VALIDATE_URL =
  process.env.NEXT_PUBLIC_OFFICE_VALIDATE_URL || "http://localhost:8130/office/validate";
const BATCH_URL =
  process.env.NEXT_PUBLIC_OFFICE_BATCH_URL || "http://localhost:8130/office/batch";
const ROUNDTRIP_URL =
  process.env.NEXT_PUBLIC_OFFICE_ROUNDTRIP_URL || "http://localhost:8130/office/roundtrip";
const PREVIEW_GENERATE_URL =
  process.env.NEXT_PUBLIC_OFFICE_PREVIEW_GENERATE_URL || "http://localhost:8130/office/preview";
const REPAIR_URL =
  process.env.NEXT_PUBLIC_OFFICE_REPAIR_URL || "http://localhost:8130/office/repair";
const WATCH_START_URL =
  process.env.NEXT_PUBLIC_OFFICE_WATCH_START_URL || "http://localhost:8130/office/watch/start";
const WATCH_STOP_URL =
  process.env.NEXT_PUBLIC_OFFICE_WATCH_STOP_URL || "http://localhost:8130/office/watch/stop";
const BLUEPRINTS_URL =
  process.env.NEXT_PUBLIC_OFFICE_BLUEPRINTS_URL || "http://localhost:8130/office/blueprints";
const BLUEPRINT_CREATE_URL =
  process.env.NEXT_PUBLIC_OFFICE_BLUEPRINT_CREATE_URL || "http://localhost:8130/office/blueprints/create";
const BLUEPRINT_SUGGEST_URL =
  process.env.NEXT_PUBLIC_OFFICE_BLUEPRINT_SUGGEST_URL || "http://localhost:8130/office/blueprints/suggest";
const VALIDATION_RESULTS_URL =
  process.env.NEXT_PUBLIC_OFFICE_VALIDATION_RESULTS_URL || "http://localhost:8130/office/validation-results";
const BATCH_JOBS_URL =
  process.env.NEXT_PUBLIC_OFFICE_BATCH_JOBS_URL || "http://localhost:8130/office/batch/jobs";
const BATCH_STATUS_URL =
  process.env.NEXT_PUBLIC_OFFICE_BATCH_STATUS_URL || "http://localhost:8130/office/batch/jobs";
const TEMPLATE_PLACEHOLDERS_URL =
  process.env.NEXT_PUBLIC_OFFICE_TEMPLATE_PLACEHOLDERS_URL || "http://localhost:8130/office/templates/placeholders";
const TEMPLATE_MERGE_FORM_URL =
  process.env.NEXT_PUBLIC_OFFICE_TEMPLATE_MERGE_FORM_URL || "http://localhost:8130/office/templates/merge-form";
const OFFICE_AGENT_ENABLED =
  (process.env.NEXT_PUBLIC_OFFICE_AGENT_ENABLED || "false").toLowerCase() !== "false";
const OFFICE_AGENT_NAME = process.env.NEXT_PUBLIC_OFFICE_AGENT_NAME || "office_agent";
const ODF_ENABLED =
  (process.env.NEXT_PUBLIC_ALPHARAVIS_ENABLE_ODF_UPLOAD || "false").toLowerCase() === "true";

function previewPort(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.port) return parsed.port;
    if (parsed.protocol === "https:") return "443";
    if (parsed.protocol === "http:") return "80";
  } catch {
    // Fall through to AlphaRavis/OfficeCLI's default watch port.
  }
  return "26315";
}

const PREVIEW_PORT = previewPort(PREVIEW_URL);

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
  preview_available?: boolean;
  preview_image_url?: string;
  preview_html_url?: string;
  validation_status?: string;
  validation_badge?: string;
  validation_issues?: Array<Record<string, unknown>>;
  validation_summary?: string;
}

interface OfficePhase5Plan {
  phase?: number;
  operation?: string;
  status?: string;
  commands?: string[];
  notes?: string[];
}

interface OfficePhase6Plan extends OfficePhase5Plan {
  preview_url?: string;
  preview_html?: string;
  preview_image?: string;
  output?: string;
  blueprint?: string;
  message?: string;
  examples?: string[];
  ui_hint?: string;
  job_id?: string;
  progress?: { total?: number; completed?: number; failed?: number; percent?: number };
  fields?: TemplatePlaceholderField[];
  placeholders?: string[];
  missing_fields?: string[];
}

interface TemplatePlaceholderField {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
}

interface ValidationResult {
  file?: string;
  status?: string;
  summary?: string;
  issues?: Array<Record<string, unknown>>;
}

interface BatchJobRecord {
  job_id?: string;
  status?: string;
  progress?: { total?: number; completed?: number; failed?: number; percent?: number };
  template?: string;
  output_dir?: string;
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

function officeOutputPath(file: OfficeOutputFile): string {
  return `${OFFICE_OUTPUT_DIR}/${file.relative_path || file.filename}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function fetchOfficePlan(url: string, body: Record<string, unknown>): Promise<OfficePhase5Plan | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return (await response.json()) as OfficePhase5Plan;
  } catch {
    return null;
  }
}

async function fetchOfficeWorkflowPlan(url: string, body: Record<string, unknown>): Promise<OfficePhase6Plan | null> {
  return (await fetchOfficePlan(url, body)) as OfficePhase6Plan | null;
}

function planCommands(plan: OfficePhase5Plan | null, fallback: string[]): string[] {
  if (plan?.commands?.length) {
    return plan.commands;
  }
  return fallback;
}

const EXTENSION_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  ".docx": FileText,
  ".pptx": Presentation,
  ".xlsx": FileSpreadsheet,
};

export const OfficePanel = React.memo(function OfficePanel() {
  const { isLoading, sendMessage } = useChatContext();
  const sendOfficeAgentMessage = useCallback(
    (message: string) => {
      const routedMessage = OFFICE_AGENT_ENABLED
        ? [`Office-Agent Auftrag (${OFFICE_AGENT_NAME}).`, message].join("\n")
        : message;
      sendMessage(
        routedMessage,
        undefined,
        OFFICE_AGENT_ENABLED ? { activeAgent: OFFICE_AGENT_NAME } : undefined
      );
    },
    [sendMessage]
  );
  const [kind, setKind] = useState<OfficeKind>("pptx");
  const [title, setTitle] = useState("AlphaRavis Office Document");
  const [instructions, setInstructions] = useState(
    "Erstelle ein sauberes Dokument, prüfe es mit OfficeCLI view/issues/validate und speichere das Ergebnis im Office output directory."
  );
  const [outputFiles, setOutputFiles] = useState<OfficeOutputFile[]>([]);
  const [templates, setTemplates] = useState<OfficeOutputFile[]>([]);
  const [outputFetchError, setOutputFetchError] = useState<string | null>(null);
  const [outputFetching, setOutputFetching] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [watchFile, setWatchFile] = useState<OfficeOutputFile | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [blueprints, setBlueprints] = useState<OfficeOutputFile[]>([]);
  const [blueprintHint, setBlueprintHint] = useState(
    "If you like documents you already have, you can make a blueprint out of it and reuse the structure later."
  );
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [batchJobs, setBatchJobs] = useState<BatchJobRecord[]>([]);
  const [templatePlaceholders, setTemplatePlaceholders] = useState<Record<string, TemplatePlaceholderField[]>>({});
  const [templateMergeData, setTemplateMergeData] = useState<Record<string, string>>({});

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

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(TEMPLATES_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTemplates((data.files as OfficeOutputFile[]) ?? []);
    } catch {
      setTemplates([]);
    }
  }, []);

  const fetchBlueprints = useCallback(async () => {
    try {
      const res = await fetch(BLUEPRINTS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBlueprints((data.files as OfficeOutputFile[]) ?? []);
    } catch {
      setBlueprints([]);
    }
  }, []);

  const fetchBlueprintHint = useCallback(async () => {
    try {
      const res = await fetch(BLUEPRINT_SUGGEST_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as OfficePhase6Plan;
      if (data.message) setBlueprintHint(data.message);
    } catch {
      // Keep the local hint when the media-gallery endpoint is unavailable.
    }
  }, []);

  const fetchValidationResults = useCallback(async () => {
    try {
      const res = await fetch(VALIDATION_RESULTS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setValidationResults((data.results as ValidationResult[]) ?? []);
    } catch {
      setValidationResults([]);
    }
  }, []);

  const fetchBatchJobs = useCallback(async () => {
    try {
      const res = await fetch(BATCH_STATUS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBatchJobs((data.jobs as BatchJobRecord[]) ?? []);
    } catch {
      setBatchJobs([]);
    }
  }, []);

  const fetchTemplatePlaceholders = useCallback(async (template: OfficeOutputFile) => {
    try {
      const url = `${TEMPLATE_PLACEHOLDERS_URL}?template=${encodeURIComponent(template.relative_path || template.filename)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as OfficePhase6Plan;
      setTemplatePlaceholders((previous) => ({
        ...previous,
        [template.relative_path || template.filename]: data.fields ?? [],
      }));
    } catch {
      setTemplatePlaceholders((previous) => ({
        ...previous,
        [template.relative_path || template.filename]: [],
      }));
    }
  }, []);

  useEffect(() => {
    fetchOutputFiles();
    fetchTemplates();
    fetchBlueprints();
    fetchBlueprintHint();
    fetchValidationResults();
    fetchBatchJobs();
  }, [fetchOutputFiles, fetchTemplates, fetchBlueprints, fetchBlueprintHint, fetchValidationResults, fetchBatchJobs]);

  // Auto-refresh output files after the agent finishes a command
  const prevLoading = useRef(isLoading);
  useEffect(() => {
    const wasLoading = prevLoading.current;
    prevLoading.current = isLoading;
    if (wasLoading && !isLoading) {
      const timer = setTimeout(() => {
        fetchOutputFiles();
        fetchTemplates();
        fetchBlueprints();
        fetchValidationResults();
        fetchBatchJobs();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, fetchOutputFiles, fetchTemplates, fetchBlueprints, fetchValidationResults, fetchBatchJobs]);

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
      "Wenn Live Preview nötig ist, nutze officecli watch mit dem konfigurierten Preview-Port und nenne die Preview-URL.",
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  /** Office file extensions that go to the Office output directory */
  const OFFICE_EXTENSIONS = [".docx", ".pptx", ".xlsx", ".doc", ".ppt", ".xls"];
  const ODF_EXTENSIONS = [".odt", ".odp", ".ods"];
  const isOfficeFile = (file: File): boolean => {
    const lower = file.name.toLowerCase();
    return OFFICE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  };
  const isOdfFile = (file: File): boolean => {
    const lower = file.name.toLowerCase();
    return ODF_EXTENSIONS.some((ext) => lower.endsWith(ext));
  };
  const uploadAccept = [
    ".docx,.pptx,.xlsx,.doc,.ppt,.xls",
    ODF_ENABLED ? ".odt,.odp,.ods" : "",
    ".pdf,image/*,video/*,audio/*,.txt,.md,.csv,.json",
  ].filter(Boolean).join(",");

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const odfUpload = isOdfFile(file);
      if (odfUpload && !ODF_ENABLED) {
        throw new Error("ODF upload is disabled. Set ALPHARAVIS_ENABLE_ODF_UPLOAD=true and rebuild the UI to enable .odt/.odp/.ods uploads.");
      }

      if (isOfficeFile(file)) {
        // Office files → Office output directory (OfficeCLI can work on them)
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(OUTPUT_UPLOAD_URL, { method: "POST", body: formData });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const uploaded = data.file as OfficeOutputFile | undefined;
        await fetchOutputFiles();
        if (uploaded) {
          const filePath = officeOutputPath(uploaded);
          sendOfficeAgentMessage(
            [
              `Office-Datei wurde hochgeladen und liegt im Office output directory.`,
              `Datei: ${filePath}`,
              `Bitte inspiziere sie mit OfficeCLI (view text/outline/stats/issues --json), fasse den Inhalt kurz zusammen und nutze sie als Arbeitsdatei für weitere Bearbeitung.`,
            ].join("\n")
          );
        }
      } else {
        // Images, PDFs, videos, text files, and ODF inputs → Media Gallery.
        // ODF files are converted server-side by Media Gallery when the ODF feature flag is enabled.
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(MEDIA_GALLERY_UPLOAD_URL, { method: "POST", body: formData });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const convertedAsset = data.converted_asset as { public_url?: string; filename?: string; mime_type?: string } | undefined;
        const originalAsset = data.original_asset as { public_url?: string; filename?: string; mime_type?: string } | undefined;
        const publicUrl = (convertedAsset?.public_url || data.public_url) as string;
        const fileType = odfUpload ? "ODF-Datei" :
          file.type.startsWith("video/") ? "Video" :
          file.type.startsWith("audio/") ? "Audio" :
          file.type.startsWith("image/") ? "Bild" :
          file.type === "application/pdf" ? "PDF" : "Datei";
        await fetchOutputFiles();
        sendOfficeAgentMessage(
          [
            odfUpload && convertedAsset
              ? `${fileType} wurde in der Media Gallery hochgeladen und per OnlyOffice nach ${convertedAsset.filename || "OOXML"} konvertiert.`
              : `${fileType} wurde in die Media Gallery hochgeladen.`,
            `URL: ${publicUrl}`,
            convertedAsset?.mime_type ? `Konvertierter MIME-Type: ${convertedAsset.mime_type}` : "",
            originalAsset?.public_url ? `Original-URL: ${originalAsset.public_url}` : "",
            `Dateiname: ${file.name}`,
            odfUpload
              ? `Bitte nutze die konvertierte OOXML-Datei aus der URL für weitere Office-Bearbeitung.`
              : `Bitte analysiere die Datei mit den verfügbaren Tools. Für Bilder/PDFs nutze vision_analyze, für Videos/Audio nutze die Media-Analyse-Tools.`,
          ].filter(Boolean).join("\n")
        );
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleScreenshot = (file: OfficeOutputFile) => {
    const base = file.filename.replace(/\.[^.]+$/, "");
    const filePath = officeOutputPath(file);
    const screenshotPath = `${OFFICE_OUTPUT_DIR}/${base}-preview.png`;
    const message = [
      `Generiere einen Screenshot des Office-Dokuments mit OfficeCLI.`,
      `Datei: ${filePath}`,
      `Befehl: officecli view ${shellQuote(filePath)} screenshot -o ${shellQuote(screenshotPath)}`,
      `Speichere das PNG unter ${screenshotPath} und bestätige den Dateipfad.`,
      `Falls mehrere Seiten: nutze --page 1-3 oder --page all für alle Seiten.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  const handleWatch = async (file: OfficeOutputFile) => {
    setWatchFile(file);
    const filePath = officeOutputPath(file);
    const fallback = [
      `nohup officecli watch ${shellQuote(filePath)} --port ${PREVIEW_PORT} > /tmp/officecli-watch.log 2>&1 &`,
    ];
    const plan = await fetchOfficeWorkflowPlan(WATCH_START_URL, { file: file.relative_path || file.filename });
    const message = [
      `Starte den Managed Watch-Modus für das Office-Dokument und öffne die Preview frame in der UI.`,
      `Phase: ${plan?.phase ?? 6}; Operation: ${plan?.operation ?? "watch_start"}; Status: ${plan?.status ?? "planned"}`,
      `Datei: ${filePath}`,
      `Preview-URL: ${plan?.preview_url ?? PREVIEW_URL}`,
      `UI-Hinweis: ${plan?.ui_hint ?? "Preview frame bleibt direkt im Office Tab eingebettet; standalone URL bleibt kompatibel."}`,
      `Plan-Befehle:`,
      ...planCommands(plan, fallback).map((command) => `- ${command}`),
      `Nutze den lokalen Shell/execute_local_command-Pfad; keine Hermes-spezifischen Background- oder Process-Parameter.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  const handleStopWatch = async () => {
    const filePath = watchFile ? officeOutputPath(watchFile) : "<file>";
    const current = watchFile;
    setWatchFile(null);
    const fallback = [`officecli unwatch ${shellQuote(filePath)}`];
    const plan = current
      ? await fetchOfficeWorkflowPlan(WATCH_STOP_URL, { file: current.relative_path || current.filename })
      : null;
    const message = [
      `Stoppe den laufenden Managed Watch-Modus für das Office-Dokument.`,
      `Phase: ${plan?.phase ?? 6}; Operation: ${plan?.operation ?? "watch_stop"}; Status: ${plan?.status ?? "stopped"}`,
      `Datei: ${filePath}`,
      `Plan-Befehle:`,
      ...planCommands(plan, fallback).map((command) => `- ${command}`),
      `Falls unwatch keinen laufenden Prozess findet, prüfe /tmp/officecli-watch.log und bestätige den Status.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  const handleGeneratePreview = async (file: OfficeOutputFile) => {
    const filePath = officeOutputPath(file);
    const base = file.filename.replace(/\.[^.]+$/, "");
    const fallback = [
      `officecli view ${shellQuote(filePath)} html -o ${shellQuote(`${OFFICE_OUTPUT_DIR}/${base}-preview.html`)}`,
      `officecli view ${shellQuote(filePath)} screenshot -o ${shellQuote(`${OFFICE_OUTPUT_DIR}/${base}-preview.png`)}`,
    ];
    const plan = await fetchOfficeWorkflowPlan(PREVIEW_GENERATE_URL, { file: file.relative_path || file.filename });
    const message = [
      `Generiere Preview-Artefakte für dieses Office-Dokument.`,
      `Phase: ${plan?.phase ?? 6}; Operation: ${plan?.operation ?? "preview"}; Status: ${plan?.status ?? "planned"}`,
      `Datei: ${filePath}`,
      `Preview HTML: ${plan?.preview_html ?? `${OFFICE_OUTPUT_DIR}/${base}-preview.html`}`,
      `Preview PNG: ${plan?.preview_image ?? `${OFFICE_OUTPUT_DIR}/${base}-preview.png`}`,
      `Plan-Befehle:`,
      ...planCommands(plan, fallback).map((command) => `- ${command}`),
      `Danach Output files refreshen, damit Preview PNG/HTML direkt angezeigt werden.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  const handleRepair = async (file: OfficeOutputFile) => {
    const filePath = officeOutputPath(file);
    const base = file.filename.replace(/\.[^.]+$/, "");
    const extension = file.extension || ".docx";
    const repaired = `${OFFICE_OUTPUT_DIR}/${base}-repaired${extension}`;
    const fallback = [
      `officecli validate ${shellQuote(filePath)}`,
      `officecli view ${shellQuote(filePath)} issues --json`,
      `officecli repair ${shellQuote(filePath)} -o ${shellQuote(repaired)}`,
      `officecli validate ${shellQuote(repaired)}`,
    ];
    const plan = await fetchOfficeWorkflowPlan(REPAIR_URL, { file: file.relative_path || file.filename });
    const message = [
      `Repariere diese Office-Datei nicht-destruktiv per OfficeCLI.`,
      `Phase: ${plan?.phase ?? 6}; Operation: ${plan?.operation ?? "repair"}; Status: ${plan?.status ?? "planned"}`,
      `Original: ${filePath}`,
      `Reparierte Kopie: ${plan?.output ?? repaired}`,
      `Plan-Befehle:`,
      ...planCommands(plan, fallback).map((command) => `- ${command}`),
      `Wichtig: Original nicht überschreiben; sichere Fixes nur in der reparierten Kopie anwenden.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  const handleBlueprintCreate = async (file: OfficeOutputFile) => {
    const filePath = officeOutputPath(file);
    const base = file.filename.replace(/\.[^.]+$/, "");
    const blueprintPath = `${OFFICE_OUTPUT_DIR}/${base}-blueprint.json`;
    const fallback = [
      `officecli dump ${shellQuote(filePath)} -o ${shellQuote(blueprintPath)}`,
      `officecli view ${shellQuote(filePath)} outline --json`,
    ];
    const plan = await fetchOfficeWorkflowPlan(BLUEPRINT_CREATE_URL, { file: file.relative_path || file.filename });
    const message = [
      `Erstelle aus diesem schönen/fertigen Dokument einen wiederverwendbaren Blueprint.`,
      `Hinweis: ${blueprintHint}`,
      `Phase: ${plan?.phase ?? 6}; Operation: ${plan?.operation ?? "blueprint_create"}; Status: ${plan?.status ?? "planned"}`,
      `Datei: ${filePath}`,
      `Blueprint: ${plan?.blueprint ?? blueprintPath}`,
      `Plan-Befehle:`,
      ...planCommands(plan, fallback).map((command) => `- ${command}`),
      `Beschreibe danach kurz, welche Layout-/Style-Regeln daraus wiederverwendbar sind.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  const handleTemplateMerge = async (template: OfficeOutputFile) => {
    const templatePath = officeOutputPath(template);
    const extension = template.extension || ".docx";
    const base = template.filename.replace(/\.[^.]+$/, "");
    const outputRelative = `${base}-merged${extension}`;
    const output = `${OFFICE_OUTPUT_DIR}/${outputRelative}`;
    const fallback = [
      `officecli merge ${shellQuote(templatePath)} ${shellQuote(output)} '{"title":"${title}","author":"AlphaRavis"}'`,
      `officecli validate ${shellQuote(output)}`,
      `officecli view ${shellQuote(output)} issues --json`,
    ];
    const plan = await fetchOfficePlan(TEMPLATE_MERGE_URL, {
      template: template.relative_path || template.filename,
      output: outputRelative,
      data: { title, author: "AlphaRavis" },
    });
    const message = [
      `Nutze die Template Gallery und erstelle ein neues Office-Dokument per OfficeCLI merge.`,
      `Phase: ${plan?.phase ?? 5}; Operation: ${plan?.operation ?? "template_merge"}; Status: ${plan?.status ?? "planned"}`,
      `Template: ${templatePath}`,
      `Output: ${output}`,
      `Plan-Befehle:`,
      ...planCommands(plan, fallback).map((command) => `- ${command}`),
      `Passe die JSON-Daten an die Template-Platzhalter an, prüfe danach mit officecli validate und view issues --json.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  const handleBatch = async (file: OfficeOutputFile) => {
    const filePath = officeOutputPath(file);
    const fallback = [
      `officecli batch ${shellQuote(filePath)} --input /workspace/office-output/batch-input.json`,
      `officecli validate ${shellQuote(filePath)}`,
    ];
    const plan = await fetchOfficePlan(BATCH_URL, {
      file: file.relative_path || file.filename,
      input: "batch-input.json",
    });
    const message = [
      `Plane und führe eine sichere OfficeCLI Batch Operation aus.`,
      `Phase: ${plan?.phase ?? 5}; Operation: ${plan?.operation ?? "batch"}; Status: ${plan?.status ?? "planned"}`,
      `Ausgangsdatei/Template: ${filePath}`,
      `Plan-Befehle:`,
      ...planCommands(plan, fallback).map((command) => `- ${command}`),
      `Bevor du schreibst: nenne Ziel-Dateinamen, Anzahl der Dateien und führe danach officecli validate für erzeugte Dateien aus.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  const handleManagedBatch = async (file: OfficeOutputFile) => {
    const filePath = officeOutputPath(file);
    const plan = await fetchOfficeWorkflowPlan(BATCH_JOBS_URL, {
      template: file.relative_path || file.filename,
      input: "batch-input.json",
      output_dir: `batch-output/${file.filename.replace(/\.[^.]+$/, "")}`,
      total: 0,
    });
    await fetchBatchJobs();
    const fallback = [`officecli batch ${shellQuote(filePath)} --input /workspace/office-output/batch-input.json --output-dir /workspace/office-output/batch-output`];
    const message = [
      `Starte einen echten Managed Batch-Prozess mit persistenter Job History im bestehenden run_state_manager.`,
      `Phase: ${plan?.phase ?? 6}; Operation: ${plan?.operation ?? "batch_job"}; Status: ${plan?.status ?? "planned"}`,
      `Job ID: ${plan?.job_id ?? "wird vom Media-Gallery-State-Manager vergeben"}`,
      `Template/Input: ${filePath}`,
      `Batch progress: ${plan?.progress?.completed ?? 0}/${plan?.progress?.total ?? 0} completed, ${plan?.progress?.failed ?? 0} failed`,
      `Plan-Befehle:`,
      ...planCommands(plan, fallback).map((command) => `- ${command}`),
      `Während der Ausführung Progress mit ${BATCH_STATUS_URL}?job_id=<job_id> aktualisieren/prüfen; Fehler je Row als errors speichern.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  const handleTemplateMergeForm = async (template: OfficeOutputFile) => {
    const key = template.relative_path || template.filename;
    let fields = templatePlaceholders[key] ?? [];
    if (!fields.length) {
      await fetchTemplatePlaceholders(template);
      fields = templatePlaceholders[key] ?? [];
    }
    const data = fields.reduce<Record<string, string>>((acc, field) => {
      acc[field.name] = templateMergeData[field.name] || title;
      return acc;
    }, {});
    const extension = template.extension || ".docx";
    const outputRelative = `${template.filename.replace(/\.[^.]+$/, "")}-form-merged${extension}`;
    const plan = await fetchOfficeWorkflowPlan(TEMPLATE_MERGE_FORM_URL, {
      template: key,
      output: outputRelative,
      data,
    });
    const message = [
      `Nutze die Template merge form mit Placeholder-Erkennung.`,
      `Template merge form: ${officeOutputPath(template)}`,
      `Placeholder: ${(plan?.placeholders ?? fields.map((field) => field.name)).join(", ") || "keine automatisch erkannt"}`,
      `Fehlende Felder: ${(plan?.missing_fields ?? []).join(", ") || "keine"}`,
      `Plan-Befehle:`,
      ...planCommands(plan, [`officecli merge ${shellQuote(officeOutputPath(template))} ${shellQuote(`${OFFICE_OUTPUT_DIR}/${outputRelative}`)} ${shellQuote(JSON.stringify(data))}`]).map((command) => `- ${command}`),
      `Falls die Datei Platzhalter wegen Rich-Text-Splitting nicht automatisch zeigt, inspiziere sie mit OfficeCLI view text/outline und leite zusätzliche Felder ab.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  const handleValidate = async (file: OfficeOutputFile) => {
    const filePath = officeOutputPath(file);
    const fallback = [
      `officecli validate ${shellQuote(filePath)}`,
      `officecli view ${shellQuote(filePath)} issues --json`,
    ];
    const plan = await fetchOfficePlan(VALIDATE_URL, { file: file.relative_path || file.filename });
    const message = [
      `Führe die OfficeCLI Validation Pipeline für dieses Dokument aus.`,
      `Phase: ${plan?.phase ?? 5}; Operation: ${plan?.operation ?? "validate"}; Status: ${plan?.status ?? "planned"}`,
      `Datei: ${filePath}`,
      `Plan-Befehle:`,
      ...planCommands(plan, fallback).map((command) => `- ${command}`),
      `Falls einfache Layout-/Font-/Strukturprobleme auftauchen, schlage Fixes vor und wende sichere Fixes mit officecli set/add an.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
  };

  const handleRoundTrip = async (file: OfficeOutputFile) => {
    const filePath = officeOutputPath(file);
    const base = file.filename.replace(/\.[^.]+$/, "");
    const blueprintPath = `${OFFICE_OUTPUT_DIR}/${base}-blueprint.json`;
    const fallback = [
      `officecli dump ${shellQuote(filePath)} -o ${shellQuote(blueprintPath)}`,
      `officecli batch ${shellQuote(filePath)} --input ${shellQuote(blueprintPath)}`,
    ];
    const plan = await fetchOfficePlan(ROUNDTRIP_URL, { file: file.relative_path || file.filename });
    const message = [
      `Starte Round-trip Learning für dieses Office-Dokument.`,
      `Phase: ${plan?.phase ?? 5}; Operation: ${plan?.operation ?? "roundtrip"}; Status: ${plan?.status ?? "planned"}`,
      `Datei: ${filePath}`,
      `Plan-Befehle:`,
      ...planCommands(plan, fallback).map((command) => `- ${command}`),
      `Analysiere die Blueprint-Struktur und beschreibe, welche wiederverwendbaren Layout-/Template-Regeln daraus entstehen.`,
    ].join("\n");
    sendOfficeAgentMessage(message);
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

          <div className="rounded-lg border border-dashed border-border bg-background/60 p-3 text-sm text-muted-foreground">
            <label className="block space-y-2">
              <span className="font-medium text-foreground">Upload file</span>
              <input
                type="file"
                accept={uploadAccept}
                onChange={handleUpload}
                disabled={uploading || isLoading}
                className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[#2F6868] file:px-3 file:py-1.5 file:text-xs file:text-white hover:file:bg-[#2F6868]/80 disabled:opacity-50"
              />
            </label>
            <p className="mt-2 text-xs">
              {uploading ? "Uploading…" : "Office files (DOCX/PPTX/XLSX) go to Office output directory. Images, PDFs, videos, and other files go to Media Gallery for analysis."}
            </p>
            {uploadError && <p className="mt-2 text-xs text-red-400">Upload failed: {uploadError}</p>}
          </div>
        </form>

        <aside className="space-y-4">
          {watchFile && (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium text-foreground">
                    Live Preview: {watchFile.filename}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Watching via officecli on port {PREVIEW_PORT}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStopWatch}
                  disabled={isLoading}
                  className="ml-3 h-8 shrink-0 text-xs"
                >
                  <MonitorStop className="mr-1 h-3 w-3" />
                  Stop
                </Button>
              </div>
              <div className="aspect-[4/3] w-full">
                <iframe
                  src={PREVIEW_URL}
                  className="h-full w-full border-0"
                  title="Office Live Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Template Gallery</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Templates from /workspace/office-output/templates.
                </p>
              </div>
              <a
                href={TEMPLATES_URL}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                JSON
              </a>
            </div>
            <div className="mt-4 rounded-lg border border-dashed border-[#2F6868]/40 bg-[#2F6868]/10 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Blueprint Library tip</p>
              <p className="mt-1">{blueprintHint}</p>
              <p className="mt-1">
                {blueprints.length > 0
                  ? `${blueprints.length} blueprint${blueprints.length === 1 ? "" : "s"} available.`
                  : "No blueprints yet. Use Make blueprint on an output file you like."}
              </p>
            </div>
            <div className="mt-4 space-y-2">
              {templates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No templates yet. Put DOCX/PPTX/XLSX files under templates/ to enable merge workflows.
                </div>
              ) : (
                templates.map((template) => {
                  const ExtIcon = EXTENSION_ICON[template.extension] ?? FileType2;
                  return (
                    <div key={template.relative_path} className="rounded-lg border border-border bg-background/60 p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <ExtIcon className="h-4 w-4 text-[#7dd3c7]" />
                        <span className="min-w-0 flex-1 truncate text-foreground">{template.filename}</span>
                        <button
                          type="button"
                          onClick={() => handleTemplateMerge(template)}
                          disabled={isLoading}
                          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          Merge
                        </button>
                        <button
                          type="button"
                          onClick={() => fetchTemplatePlaceholders(template)}
                          disabled={isLoading}
                          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          Detect placeholder
                        </button>
                      </div>
                      {(templatePlaceholders[template.relative_path || template.filename] ?? []).length > 0 && (
                        <div className="mt-3 rounded-md border border-border bg-card/60 p-2 text-xs text-muted-foreground">
                          <p className="font-medium text-foreground">Template merge form</p>
                          <p className="mt-1">
                            Placeholder: {(templatePlaceholders[template.relative_path || template.filename] ?? []).map((field) => field.name).join(", ")}
                          </p>
                          <div className="mt-2 space-y-1">
                            {(templatePlaceholders[template.relative_path || template.filename] ?? []).map((field) => (
                              <Input
                                key={field.name}
                                value={templateMergeData[field.name] ?? ""}
                                placeholder={field.label || field.name}
                                onChange={(event) =>
                                  setTemplateMergeData((previous) => ({ ...previous, [field.name]: event.target.value }))
                                }
                                className="h-8 text-xs"
                              />
                            ))}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleTemplateMergeForm(template)}
                            disabled={isLoading}
                            className="mt-2 h-8 text-xs"
                          >
                            Run template merge form
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

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
                            {file.preview_available ? (
                              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
                                Preview ready
                              </span>
                            ) : null}
                            {file.validation_badge && file.validation_badge !== "not_validated" ? (
                              <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-300">
                                validationBadge: {file.validation_badge}
                              </span>
                            ) : null}
                          </div>
                          {(file.validation_issues?.length ?? 0) > 0 ? (
                            <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-200">
                              <p className="font-medium">Validation issues</p>
                              <p>{file.validation_summary || `${file.validation_issues?.length ?? 0} issue(s)`}</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleWatch(file)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          <MonitorPlay className="h-3 w-3" />
                          Watch
                        </button>
                        <button
                          type="button"
                          onClick={() => handleScreenshot(file)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          <Camera className="h-3 w-3" />
                          Screenshot
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGeneratePreview(file)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          <Eye className="h-3 w-3" />
                          Generate preview
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRepair(file)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          Repair
                        </button>
                        <button
                          type="button"
                          onClick={() => handleValidate(file)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          Validate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBatch(file)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          Batch
                        </button>
                        <button
                          type="button"
                          onClick={() => handleManagedBatch(file)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          Managed Batch
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRoundTrip(file)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          Round-trip
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBlueprintCreate(file)}
                          disabled={isLoading}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        >
                          Make blueprint
                        </button>
                        {file.preview_image_url ? (
                          <a
                            href={file.preview_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Eye className="h-3 w-3" />
                            Preview PNG
                          </a>
                        ) : null}
                        {file.preview_html_url ? (
                          <a
                            href={file.preview_html_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Eye className="h-3 w-3" />
                            Preview HTML
                          </a>
                        ) : null}
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

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-foreground">Workflow state</h3>
              <button
                type="button"
                onClick={() => {
                  fetchValidationResults();
                  fetchBatchJobs();
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Refresh state
              </button>
            </div>
            <div className="mt-3 space-y-3 text-xs text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Validation issues</p>
                {validationResults.length === 0 ? (
                  <p>No persisted validation results yet.</p>
                ) : (
                  validationResults.slice(0, 5).map((result) => (
                    <p key={`${result.file}-${result.status}`}>
                      {result.file}: {result.status} {result.summary ? `— ${result.summary}` : ""}
                    </p>
                  ))
                )}
              </div>
              <div>
                <p className="font-medium text-foreground">Batch progress</p>
                {batchJobs.length === 0 ? (
                  <p>No managed batch jobs yet.</p>
                ) : (
                  batchJobs.slice(0, 5).map((job) => (
                    <p key={job.job_id}>
                      {job.job_id}: {job.status} — {job.progress?.completed ?? 0}/{job.progress?.total ?? 0}, failed {job.progress?.failed ?? 0}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Output versions — collapsible list of generated files and previews. */}
          <div className="rounded-xl border border-border bg-card p-5 text-sm shadow-sm">
            <button
              type="button"
              onClick={() => setCompareOpen((prev) => !prev)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <h3 className="font-medium text-foreground">Output versions</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {compareOpen ? "Click to collapse" : "Click to expand — generated files, previews, and validation state"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {compareOpen ? "▲" : "▶"}
              </span>
            </button>
            {compareOpen && (
              <div className="mt-4 space-y-3">
                {outputFiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No files generated yet. Create or upload a document to see output versions here.
                  </p>
                ) : (
                  outputFiles.map((file) => (
                    <div key={file.relative_path} className="rounded-lg border border-border/60 bg-background/60 p-3">
                      <div className="flex items-center gap-3 text-xs">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-[#7dd3c7]" />
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                          {file.filename}
                        </span>
                        <span className="shrink-0 text-muted-foreground">{formatSize(file.size)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {file.preview_html_url && (
                          <a
                            href={file.preview_html_url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded border border-border px-2 py-0.5 hover:bg-accent hover:text-foreground"
                          >
                            HTML Preview
                          </a>
                        )}
                        {file.preview_image_url && (
                          <a
                            href={file.preview_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded border border-border px-2 py-0.5 hover:bg-accent hover:text-foreground"
                          >
                            PNG Preview
                          </a>
                        )}
                        <span className="rounded border border-border px-2 py-0.5">
                          {file.extension.toUpperCase()}
                        </span>
                        {file.validation_badge && file.validation_badge !== "not_validated" && (
                          <span className="rounded bg-sky-500/10 px-2 py-0.5 text-sky-300">
                            ✓ Validated
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
            <h3 className="font-medium text-foreground">Runtime checklist</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Feature flag: ALPHARAVIS_ENABLE_OFFICECLI=true</li>
              <li>Container binary: officecli --version</li>
              <li>Live preview: officecli watch &lt;file&gt; --port {PREVIEW_PORT}</li>
              <li>MCP optional: ALPHARAVIS_ENABLE_OFFICECLI_MCP=false by default</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
});
