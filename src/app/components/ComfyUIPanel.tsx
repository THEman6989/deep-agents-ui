"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Boxes, CheckCircle2, CircleAlert, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COMFYUI_API_BASE =
  process.env.NEXT_PUBLIC_COMFYUI_PANEL_API_BASE || "http://localhost:8130/comfyui";

const MODEL_FOLDERS = ["checkpoints", "vae", "loras", "controlnet", "clip", "unet"];

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

async function getJson(path: string, signal?: AbortSignal) {
  const response = await fetch(`${COMFYUI_API_BASE}${path}`, { signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail || data?.error || response.statusText);
  }
  return data;
}

export function ComfyUIPanel() {
  const [status, setStatus] = useState<any | null>(null);
  const [queue, setQueue] = useState<any | null>(null);
  const [models, setModels] = useState<any | null>(null);
  const [folder, setFolder] = useState("checkpoints");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const [statusRaw, queueData, modelsRaw] = await Promise.all([
        getJson("/system_stats", controller.signal),
        getJson("/queue", controller.signal),
        getJson(`/models/${encodeURIComponent(folder)}`, controller.signal),
      ]);
      // ComfyUI returns system_stats directly; wrap for UI compatibility
      const statusWrapped = { ok: true, base_url: COMFYUI_API_BASE, status: statusRaw };
      const modelsWrapped = { ok: true, base_url: COMFYUI_API_BASE, total: modelNames(modelsRaw).length, models: modelsRaw };
      setStatus(statusWrapped);
      setQueue({ ok: true, base_url: COMFYUI_API_BASE, queue: queueData });
      setModels(modelsWrapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    return () => controller.abort();
  }, [folder]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
              LAN-Steuerung fuer den ComfyPC — direkter Zugriff auf ComfyUI API.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
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
              {ok ? "reachable" : "not reachable / not checked"}
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
                "Analysiere diesen ComfyUI API-Workflow auf fehlende Modelle/Custom Nodes, bevor er ausgefuehrt wird.",
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
              Direct workflow submit bleibt backend-seitig aus, bis ALPHARAVIS_ENABLE_COMFYUI_WORKFLOW_SUBMIT=true gesetzt ist.
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
