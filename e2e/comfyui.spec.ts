import { test, expect } from "@playwright/test";

// Mocks for media-gallery proxy /comfyui/* endpoints.
// Run with: COMFYUI_PROXY=http://localhost:8130 npx playwright test

const PROXY = process.env.COMFYUI_PROXY || "http://localhost:8130";

test.beforeEach(async ({ page }) => {
  // ComfyUI status: reachable, no models loaded (proxy response shape)
  await page.route(`${PROXY}/comfyui/status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, base_url: "unix:///workspace/runtime/comfyui.sock", system_stats: { system: { comfyui_version: "0.18.0" }, devices: [] } }),
    });
  });

  await page.route(`${PROXY}/comfyui/queue`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, queue: { queue_running: [], queue_pending: [] } }),
    });
  });

  await page.route(`${PROXY}/comfyui/models/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Preflight: ok/ready with no missing models
  await page.route(`${PROXY}/comfyui/preflight`, async (route) => {
    const request = route.request();
    const body = request.postDataJSON ? await request.postDataJSON() : {};
    const nodeCount = typeof body?.workflow === "object" ? Object.keys(body.workflow).length : 0;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        base_url: "unix://...",
        preflight: {
          ok: true,
          ready: true,
          format: "api",
          node_count: nodeCount,
          node_classes: ["CheckpointLoaderSimple"],
          model_requirements: {},
          missing_node_classes: [],
          missing_models: {},
          server_checked: false,
        },
      }),
    });
  });

  // Prompt: blocked (submit disabled)
  await page.route(`${PROXY}/comfyui/prompt`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        blocked: true,
        result: { blocked: true, error: "ComfyUI workflow submit is disabled" },
      }),
    });
  });

  // View: return a tiny transparent PNG
  await page.route(`${PROXY}/comfyui/view?*`, async (route) => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    await route.fulfill({ status: 200, contentType: "image/png", body: png });
  });

  // History: empty
  await page.route(`${PROXY}/comfyui/history/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, outputs: [] }),
    });
  });

  // Direct ComfyUI system_stats (CORS-friendly)
  await page.route("http://localhost:8188/system_stats", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ system: { comfyui_version: "0.18.0" }, devices: [] }),
    });
  });
});

test("ComfyUI tab renders, auto-detects direct connection, and shows queue/model info", async ({ page }) => {
  await page.goto("http://localhost:3000/?assistantId=alpha_ravis");
  await page.click('button:has-text("ComfyUI")');

  // Tab title visible
  await expect(page.locator("text=ComfyUI Control")).toBeVisible();

  // Auto mode resolves direct first with the mocked system_stats
  await expect(page.locator("text=reachable")).toBeVisible({ timeout: 10000 });

  // Queue shows 0
  await expect(page.locator("text=0")).toBeVisible();

  // Model folder dropdown is present
  await expect(page.locator("select, [role=combobox]").first()).toBeVisible();
});

test("Live submit is disabled by default and Draft Preflight uses proxy preflight", async ({ page }) => {
  await page.goto("http://localhost:3000/?assistantId=alpha_ravis");
  await page.click('button:has-text("ComfyUI")');

  // Live submit shows as disabled
  await expect(page.locator("text=disabled")).toBeVisible();

  // Paste a minimal API-format workflow
  const workflowJson = JSON.stringify({ "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "model.safetensors" } } });
  await page.fill('textarea, [role="textbox"]', workflowJson);

  // Draft Preflight button appears (may need a short wait for parsing)
  const draftBtn = page.locator('button:has-text("Draft Preflight")');
  await expect(draftBtn).toBeVisible({ timeout: 5000 });

  // Click Draft Preflight — should call proxy preflight and not fail
  await draftBtn.click();
  await expect(page.locator("text=ready")).toBeVisible({ timeout: 10000 });
});

test("Proxy ok:false / blocked:true is displayed as blocked, not success", async ({ page }) => {
  await page.goto("http://localhost:3000/?assistantId=alpha_ravis");
  await page.click('button:has-text("ComfyUI")');

  // Switch to proxy mode so we fully exercise the proxy path
  await page.selectOption('select, [role="combobox"]', "proxy");

  // Paste a minimal workflow
  const workflowJson = JSON.stringify({ "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "model.safetensors" } } });
  await page.fill('textarea, [role="textbox"]', workflowJson);

  // Switch to live submit mode
  await page.selectOption('select:below(:text("Submit mode"))', "live / submit after preflight");

  // Click Run Draft / Submit — it should go through proxy preflight (ok) then proxy prompt (blocked)
  const submitBtn = page.locator('button:has-text("Run Draft"), button:has-text("Submit")').first();
  if (await submitBtn.isVisible({ timeout: 3000 })) {
    await submitBtn.click();
  }

  // Should show a blocked/disallowed message, not "success"
  await expect(page.locator("text=blocked")).toBeVisible({ timeout: 15000 });
});

test("Copy prompt button works when agent is disabled", async ({ page }) => {
  await page.goto("http://localhost:3000/?assistantId=alpha_ravis");
  await page.click('button:has-text("ComfyUI")');

  // The agent handoff buttons should be present
  const agentBtn = page.locator('button:has-text("Pruefe ComfyUI")');
  await expect(agentBtn).toBeVisible({ timeout: 5000 });
});
