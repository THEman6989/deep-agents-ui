export interface StandaloneConfig {
  deploymentUrl: string;
  assistantId: string;
  langsmithApiKey?: string;
}

const CONFIG_KEY = "deep-agent-config";

export function getConfig(): StandaloneConfig | null {
  if (typeof window === "undefined") return null;

  const stored = localStorage.getItem(CONFIG_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fall through to env vars
    }
  }

  // Auto-configure from environment variables
  const deploymentUrl =
    process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ||
    "http://langgraph-api:2024";
  const assistantId =
    process.env.NEXT_PUBLIC_ASSISTANT_ID ||
    "alpha_ravis";

  if (deploymentUrl && assistantId) {
    const config: StandaloneConfig = {
      deploymentUrl,
      assistantId,
      langsmithApiKey: process.env.NEXT_PUBLIC_LANGSMITH_API_KEY || "",
    };
    // Persist so next load skips env check
    saveConfig(config);
    return config;
  }

  return null;
}

export function saveConfig(config: StandaloneConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}
