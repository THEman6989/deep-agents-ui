"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Boxes, CheckCircle2, CircleAlert, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_DIRECT_API_BASE =
  process.env.NEXT_PUBLIC_COMFYUI_PANEL_API_BASE || "http://localhost:8188";
const DEFAULT_PROXY_API_BASE =
  process.env.NEXT_PUBLIC_COMFYUI_PROXY_API_BASE || "http://localhost:8130/comfyui";

const MODEL_FOLDERS = ["checkpoints", "vae", "loras", "controlnet", "clip", "unet", "embeddings"];
const STORAGE_PREFIX = "alpharavis.comfyui.";

type ConnectionMode = "auto" | "direct" | "proxy";
type ConnectionKind = "direct" | "proxy";

type Candidate = {
  kind: ConnectionKind;
  baseUrl: string;
  statusPath: string;
};

type ComfyOutput = {
  node_id: string;
  output_type: string;
  filename: string;
  subfolder: string;
  type: string;
  url?: string;
};

function normalizeBaseUrl(value: string) {
  return (value || "").trim().replace(/\/+$/, "");
}

function storageGet(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(`${STORAGE_PREFIX}${key}`) || fallback;
}

function storageSet(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, value);
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const values = Object.values(value as Record<string, unknown>);
    if (values.every((item) => typeof item === "string")) return values;
  }
  return [];
}

function modelNames(payload: unknown): string[] {
  if (Array.isArray(payload)) return payload.map(String);
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["models", "data", "files"]) {
      const arr = asArray(obj[key]);
      if (arr.length) return arr.map(String);
    }
  }
  return [];
}

function queueCount(queue: any): number {
  if (!queue || typeof queue !== "object") return 0;
  const running = Array.isArray(queue.queue_running) ? queue.queue_running.length : 0;
  const pending = Array.isArray(queue.queue_pending) ? queue.queue_pending.length : 0;
  return running + pending;
}

function describeFetchError(err: unknown, candidate: Candidate) {
  const message = err instanceof Error ? err.message : String(err);
  if (message === "Failed to fetch" || message.includes("NetworkError")) {
    return `${candidate.kind} ${candidate.baseUrl}: Browser konnte ComfyUI nicht erreichen oder CORS hat geblockt.`;
  }
  return `${candidate.kind} ${candidate.baseUrl}: ${message}`;
}

async function getJson(baseUrl: string, path: string, signal?: AbortSignal) {
  const response = await fetch(`${baseUrl}${path}`, { signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail || data?.error || response.statusText);
  }
  return data;
}

async function postJson(baseUrl: string, path: string, payload: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail || data?.error || response.statusText);
  }
  return data;
}

function candidatesFor(mode: ConnectionMode, directBase: string, proxyBase: string): Candidate[] {
  const direct = normalizeBaseUrl(directBase);
  const proxy = normalizeBaseUrl(proxyBase);
  const candidates: Candidate[] = [];
  if ((mode === "direct" || mode === "auto") && direct) {
    candidates.push({ kind: "direct", baseUrl: direct, statusPath: "/system_stats" });
  }
  if ((mode === "proxy" || mode === "auto") && proxy) {
    candidates.push({ kind: "proxy", baseUrl: proxy, statusPath: "/status" });
  }
  return candidates;
}

function websocketUrl(baseUrl: string, clientId: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  const wsBase = normalized.startsWith("https://")
    ? normalized.replace("https://", "wss://")
    : normalized.replace("http://", "ws://");
  return `${wsBase}/ws?clientId=${encodeURIComponent(clientId)}`;
}

function viewUrl(baseUrl: string, output: ComfyOutput) {
  const params = new URLSearchParams({
    filename: output.filename,
    subfolder: output.subfolder || "",
    type: output.type || "output",
  });
  return `${normalizeBaseUrl(baseUrl)}/view?${params.toString()}`;
}

function normalizeOutputs(outputs: ComfyOutput[], baseUrl: string): ComfyOutput[] {
  return outputs.map((output) => ({ ...output, url: viewUrl(baseUrl, output) }));
}

function extractHistoryOutputs(historyPayload: any, promptId: string, baseUrl: string): ComfyOutput[] {
  const history = historyPayload?.history || historyPayload;
  const promptPayload = history?.[promptId] || (history && Object.keys(history).length === 1 ? Object.values(history)[0] : history);
  const outputs = (promptPayload as any)?.outputs;
  if (Array.isArray(outputs)) return normalizeOutputs(outputs as ComfyOutput[], baseUrl);
  if (Array.isArray(historyPayload?.outputs)) return normalizeOutputs(historyPayload.outputs as ComfyOutput[], baseUrl);
  if (!outputs || typeof outputs !== "object") return [];

  const extracted: ComfyOutput[] = [];
  for (const [nodeId, nodeOutputs] of Object.entries(outputs as Record<string, any>)) {
    for (const outputType of ["images", "videos", "gifs", "audio"]) {
      const items = nodeOutputs?.[outputType];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item?.filename) continue;
        const output: ComfyOutput = {
          node_id: String(nodeId),
          output_type: outputType,
          filename: String(item.filename),
          subfolder: String(item.subfolder || ""),
          type: String(item.type || "output"),
        };
        output.url = viewUrl(baseUrl, output);
        extracted.push(output);
      }
    }
  }
  return extracted;
}

export function ComfyUIPanel() {
  const [status, setStatus] = useState<any | null>(null);
  const [queue, setQueue] = useState<any | null>(null);
  const [models, setModels] = useState<any | null>(null);
  const [folder, setFolder] = useState("checkpoints");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("auto");
  const [directBase, setDirectBase] = useState(DEFAULT_DIRECT_API_BASE);
  const [proxyBase, setProxyBase] = useState(DEFAULT_PROXY_API_BASE);
  const [activeConnection, setActiveConnection] = useState<Candidate | null>(null);
  const [promptId, setPromptId] = useState("");
  const [historyOutputs, setHistoryOutputs] = useState<ComfyOutput[]>([]);
  const [watching, setWatching] = useState(false);
  const [watchLog, setWatchLog] = useState<string[]>([]);
  const [registerResult, setRegisterResult] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const appendLog = useCallback((line: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setWatchLog((items) => [`${timestamp} ${line}`, ...items].slice(0, 80));
  }, []);

  const stopWatch = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWatching(false);
  }, []);

  useEffect(() => {
    setConnectionMode(storageGet("mode", "auto") as ConnectionMode);
    setDirectBase(storageGet("directBase", DEFAULT_DIRECT_API_BASE));
    setProxyBase(storageGet("proxyBase", DEFAULT_PROXY_API_BASE));
    return () => stopWatch();
  }, [stopWatch]);

  const persistConfig = useCallback(() => {
    storageSet("mode", connectionMode);
    storageSet("directBase", normalizeBaseUrl(directBase));
    storageSet("proxyBase", normalizeBaseUrl(proxyBase));
  }, [connectionMode, directBase, proxyBase]);

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    const candidates = candidatesFor(connectionMode, directBase, proxyBase);
    const errors: string[] = [];
    setLoading(true);
    setError(null);
    try {
      for (const candidate of candidates) {
        try {
          const [statusRaw, queueRaw, modelsRaw] = await Promise.all([
            getJson(candidate.baseUrl, candidate.statusPath, controller.signal),
            getJson(candidate.baseUrl, "/queue", controller.signal),
            getJson(candidate.baseUrl, `/models/${encodeURIComponent(folder)}`, controller.signal),
          ]);
          const statusPayload = candidate.kind === "proxy" ? statusRaw.system_stats || statusRaw.status || statusRaw : statusRaw;
          const queuePayload = candidate.kind === "proxy" ? queueRaw.queue || queueRaw : queueRaw;
          const modelsPayload = candidate.kind === "proxy" ? modelsRaw.models || modelsRaw : modelsRaw;
          setStatus({ ok: true, base_url: candidate.baseUrl, mode: candidate.kind, status: statusPayload });
          setQueue({ ok: true, base_url: candidate.baseUrl, mode: candidate.kind, queue: queuePayload });
          setModels({ ok: true, base_url: candidate.baseUrl, mode: candidate.kind, total: modelNames(modelsPayload).length, models: modelsPayload });
          setActiveConnection(candidate);
          return;
        } catch (err) {
          errors.push(describeFetchError(err, candidate));
        }
      }
      setActiveConnection(null);
      throw new Error(errors.length ? errors.join("\n") : "Keine ComfyUI Connection konfiguriert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    return () => controller.abort();
  }, [connectionMode, directBase, proxyBase, folder]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveAndRefresh = useCallback(() => {
    persistConfig();
    refresh();
  }, [persistConfig, refresh]);

  const fetchHistory = useCallback(async () => {
    const id = promptId.trim();
    if (!id) {
      setError("prompt_id fehlt.");
      return [] as ComfyOutput[];
    }
    const candidates = activeConnection ? [activeConnection] : candidatesFor(connectionMode, directBase, proxyBase);
    const errors: string[] = [];
    setActionLoading(true);
    try {
      for (const candidate of candidates) {
        try {
          const raw = await getJson(candidate.baseUrl, `/history/${encodeURIComponent(id)}`);
          const outputs = extractHistoryOutputs(raw, id, candidate.baseUrl);
          setHistoryOutputs(outputs);
          appendLog(`history ${id}: ${outputs.length} output(s) via ${candidate.kind}`);
          return outputs;
        } catch (err) {
          errors.push(describeFetchError(err, candidate));
        }
      }
      throw new Error(errors.join("\n"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [] as ComfyOutput[];
    } finally {
      setActionLoading(false);
    }
  }, [activeConnection, appendLog, connectionMode, directBase, promptId, proxyBase]);

  const startWatch = useCallback(() => {
    const id = promptId.trim();
    if (!id) {
      setError("prompt_id fehlt.");
      return;
    }
    stopWatch();
    setWatching(true);
    appendLog(`watch started for ${id}`);
    fetchHistory();
    pollRef.current = setInterval(() => {
      refresh();
      fetchHistory();
    }, 2500);

    const direct = activeConnection?.kind === "direct" ? activeConnection : candidatesFor("direct", directBase, proxyBase)[0];
    if (direct?.baseUrl && typeof window !== "undefined") {
      try {
        const ws = new WebSocket(websocketUrl(direct.baseUrl, `alpharavis-ui-${Date.now()}`));
        wsRef.current = ws;
        ws.onopen = () => appendLog("websocket connected");
        ws.onclose = () => appendLog("websocket closed");
        ws.onerror = () => appendLog("websocket error");
        ws.onmessage = (event) => {
          const text = typeof event.data === "string" ? event.data : "[binary ws message]";
          if (!id || text.includes(id) || text.includes("progress") || text.includes("status")) {
            appendLog(text.length > 240 ? `${text.slice(0, 240)}...` : text);
          }
        };
      } catch (err) {
        appendLog(`websocket unavailable: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [activeConnection, appendLog, directBase, fetchHistory, promptId, proxyBase, refresh, stopWatch]);

  const registerOutputs = useCallback(async () => {
    const id = promptId.trim();
    if (!id) {
      setError("prompt_id fehlt.");
      return;
    }
    const outputs = historyOutputs.length ? historyOutputs : await fetchHistory();
    if (!outputs.length) {
      setError("Keine Outputs zum Registrieren gefunden.");
      return;
    }
    setActionLoading(true);
    setRegisterResult(null);
    try {
      const proxy = normalizeBaseUrl(proxyBase || DEFAULT_PROXY_API_BASE);
      const sourceBaseUrl = activeConnection?.kind === "direct" ? normalizeBaseUrl(directBase) : activeConnection?.baseUrl || normalizeBaseUrl(directBase);
      const result = await postJson(proxy, "/outputs/register", {
        prompt_id: id,
        outputs,
        source_base_url: sourceBaseUrl,
        download: false,
        metadata: { registered_from: "deep_agents_ui_comfyui_tab" },
      });
      setRegisterResult(result);
      appendLog(`registered ${result?.registered?.length || 0} output(s) in Media Gallery`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  }, [activeConnection, appendLog, directBase, fetchHistory, historyOutputs, promptId, proxyBase]);

  const ok = Boolean(status?.ok);
  const baseUrl = status?.base_url || queue?.base_url || models?.base_url || "configured ComfyUI";
  const names = useMemo(() => modelNames(models?.models), [models]);
  const qCount = queueCount(queue?.queue);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#47d7ac]" />
              <h2 className="text-lg font-semibold">ComfyUI Control</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Direkter Browser-Zugriff oder Media-Gallery Proxy mit Auto-Fallback, Live-Progress und Output-Registrierung.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={saveAndRefresh} disabled={loading}>
              <Save className="mr-2 h-4 w-4" />
              Save/Test
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 lg:grid-cols-[160px_1fr_1fr_auto]">
            <label className="text-xs font-medium text-muted-foreground">
              Mode
              <select
                value={connectionMode}
                onChange={(event) => setConnectionMode(event.target.value as ConnectionMode)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              >
                <option value="auto">auto</option>
                <option value="direct">direct</option>
                <option value="proxy">proxy</option>
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Direct ComfyUI API
              <input
                value={directBase}
                onChange={(event) => setDirectBase(event.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-sm text-foreground"
                placeholder="http://localhost:8188"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Proxy API
              <input
                value={proxyBase}
                onChange={(event) => setProxyBase(event.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-sm text-foreground"
                placeholder="http://localhost:8130/comfyui"
              />
            </label>
            <div className="flex items-end text-xs text-muted-foreground">
              Active: {activeConnection ? `${activeConnection.kind}` : "none"}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            `auto` versucht zuerst Direct, dann Proxy. Werte werden nur im Browser-localStorage gespeichert.
          </p>
        </div>

        {error && (
          <div className="mb-4 whitespace-pre-line rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Server</span>
              {ok ? <CheckCircle2 className="h-4 w-4 text-[#47d7ac]" /> : <CircleAlert className="h-4 w-4 text-warning" />}
            </div>
            <div className="font-mono text-xs text-muted-foreground break-all">{baseUrl}</div>
            <div className={cn("mt-3 inline-flex rounded px-2 py-1 text-xs", ok ? "bg-[#47d7ac]/10 text-[#47d7ac]" : "bg-warning/10 text-warning")}>
              {ok ? `reachable (${status?.mode})` : "not reachable / not checked"}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#47d7ac]" />
              <span className="text-sm font-medium">Queue</span>
            </div>
            <div className="text-3xl font-semibold">{qCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">running + pending jobs</div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Boxes className="h-4 w-4 text-[#47d7ac]" />
              <span className="text-sm font-medium">Models</span>
            </div>
            <select
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
              className="mb-3 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {MODEL_FOLDERS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <div className="text-3xl font-semibold">{names.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">entries in {folder}</div>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <label className="min-w-[280px] flex-1 text-xs font-medium text-muted-foreground">
              Prompt ID für History/Live-Progress
              <input
                value={promptId}
                onChange={(event) => setPromptId(event.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-sm text-foreground"
                placeholder="ComfyUI prompt_id"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchHistory()} disabled={actionLoading || !promptId.trim()}>
                Fetch History
              </Button>
              <Button variant="outline" size="sm" onClick={watching ? stopWatch : startWatch} disabled={!promptId.trim()}>
                {watching ? "Stop Live" : "Start Live"}
              </Button>
              <Button variant="outline" size="sm" onClick={registerOutputs} disabled={actionLoading || !promptId.trim()}>
                Register Outputs
              </Button>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">History outputs ({historyOutputs.length})</h3>
              {historyOutputs.length ? (
                <div className="max-h-64 space-y-2 overflow-auto text-xs text-muted-foreground">
                  {historyOutputs.map((output, index) => (
                    <div key={`${output.node_id}-${output.filename}-${index}`} className="rounded border border-border bg-background/60 p-2">
                      <div className="font-mono text-foreground">{output.filename}</div>
                      <div>{output.output_type} · node {output.node_id}</div>
                      {output.url && <a className="break-all text-[#47d7ac]" href={output.url} target="_blank" rel="noreferrer">{output.url}</a>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Noch keine History-Outputs geladen.</div>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Live log</h3>
              {watchLog.length ? (
                <div className="max-h-64 space-y-1 overflow-auto rounded bg-black/20 p-2 font-mono text-xs text-muted-foreground">
                  {watchLog.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Start Live öffnet WebSocket im direct mode und pollt Queue/History.</div>
              )}
            </div>
          </div>
          {registerResult && (
            <pre className="mt-3 max-h-48 overflow-auto rounded bg-black/20 p-3 text-xs text-muted-foreground">
              {JSON.stringify(registerResult, null, 2)}
            </pre>
          )}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Model list</h3>
            {names.length ? (
              <div className="max-h-72 space-y-1 overflow-auto font-mono text-xs text-muted-foreground">
                {names.map((name) => (
                  <div key={name} className="rounded bg-background/60 px-2 py-1">{name}</div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Keine Modelle geladen oder Ordner nicht erreichbar.</div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Agent handoff prompts</h3>
            <div className="space-y-2">
              {[
                "Pruefe ComfyUI Status, Queue und verfuegbare Checkpoints auf dem ComfyPC.",
                "Bereite ComfyPC/ComfyUI fuer einen Pixelle Job vor und melde, ob alles bereit ist.",
                "Registriere die Outputs dieser ComfyUI prompt_id in der Media Gallery.",
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => navigator.clipboard?.writeText(prompt)}
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Direct workflow submit bleibt backend-seitig aus, bis ALPHARAVIS_ENABLE_COMFYUI_WORKFLOW_SUBMIT=true gesetzt ist. Output-Registrierung speichert standardmäßig nur URLs, damit lokale Docker→Host-Port-Probleme nicht blockieren.
            </p>
          </div>
        </div>

        <details className="mt-6 rounded-lg border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Raw status / queue</summary>
          <pre className="mt-3 max-h-80 overflow-auto rounded bg-black/20 p-3 text-xs text-muted-foreground">
            {JSON.stringify({ status, queue }, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}
