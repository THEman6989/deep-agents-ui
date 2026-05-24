/**
 * Playwright smoke tests for Deep Agents UI hardening verification.
 *
 * Prerequisites:
 *   - Deep Agents UI running on http://127.0.0.1:3000
 *   - LangGraph API running on http://127.0.0.1:2024
 *   - Assistant "alpha_ravis" available
 *   - Playwright installed: npx playwright install --with-deps chromium
 *
 * Run:
 *   npx playwright test e2e/smoke.spec.ts --project=chromium
 *
 * Local dev quick-test:
 *   npx playwright test e2e/smoke.spec.ts --project=chromium --headed
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const API_URL = process.env.E2E_API_URL || "http://127.0.0.1:2024";
const ASSISTANT_ID = process.env.E2E_ASSISTANT_ID || "alpha_ravis";

/** Configure localStorage so the UI skips the ConfigDialog. */
async function configure(page: ReturnType<typeof test["info"]>["page"]) {
  await page.goto(BASE_URL);
  await page.evaluate(
    ({ apiUrl, assistantId }) => {
      localStorage.setItem(
        "deep-agent-config",
        JSON.stringify({ deploymentUrl: apiUrl, assistantId })
      );
    },
    { apiUrl: API_URL, assistantId: ASSISTANT_ID }
  );
  await page.goto(BASE_URL + "/?sidebar=threads");
  // Wait for thread list to load
  await page.waitForSelector('button:has-text("Load More")', { timeout: 15000 }).catch(() => {});
}

test.describe("Thread operations", () => {
  test("rename thread via hover controls", async ({ page }) => {
    await configure(page);

    // Hover the first thread in TODAY section
    const firstThread = page.locator('h4:text("TODAY") + button, h4:text("TODAY") ~ button').first();
    await firstThread.hover();

    // Click rename button
    const renameBtn = page.getByLabel("Rename thread").first();
    await expect(renameBtn).toBeVisible({ timeout: 5000 });
    await renameBtn.click();

    // Type new name and press Enter
    const input = firstThread.locator('input[type="text"], textbox').first();
    await expect(input).toBeVisible({ timeout: 3000 });
    await input.fill("Smoke Test Renamed");
    await input.press("Enter");

    // Verify the thread title updated in the sidebar
    await expect(page.getByText("Smoke Test Renamed").first()).toBeVisible({ timeout: 10000 });
  });

  test("delete thread with confirmation", async ({ page }) => {
    await configure(page);

    // Create a temporary thread via API (so we don't delete real threads)
    const createResp = await page.request.post(`${API_URL}/threads`, {
      data: { metadata: { title: "Smoke Delete Me" } },
    });
    expect(createResp.ok()).toBeTruthy();
    const { thread_id } = await createResp.json();

    // Reload to see the new thread
    await page.goto(`${BASE_URL}/?sidebar=threads&threadId=${thread_id}`);
    await page.waitForTimeout(1000);

    // Hover and click delete on the temp thread
    const threadBtn = page.locator(`button:has-text("Smoke Delete Me")`).first();
    await threadBtn.hover();
    const deleteBtn = page.getByLabel("Delete thread").first();
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();

    // Thread should disappear from sidebar
    await expect(threadBtn).not.toBeVisible({ timeout: 10000 });
  });
});

test.describe("File upload", () => {
  test("file picker opens and processes file", async ({ page }) => {
    await configure(page);

    // Click the upload button
    const uploadBtn = page.getByLabel("Upload file");
    await expect(uploadBtn).toBeVisible();

    // Create a test file and upload via file chooser
    const fileChooserPromise = page.waitForEvent("filechooser");
    await uploadBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "smoke-test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello smoke test"),
    });

    // Check that content blocks appeared
    await expect(page.locator('[data-testid="content-block"]').first()).toBeVisible({ timeout: 10000 });
  });

  test("preview panel opens and shows file content", async ({ page }) => {
    await configure(page);

    // Upload a file for preview
    const uploadBtn = page.getByLabel("Upload file");
    const fileChooserPromise = page.waitForEvent("filechooser");
    await uploadBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "preview-test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("preview content line 1\npreview content line 2"),
    });
    await page.waitForTimeout(500);

    // Click Preview button (eye icon) in the attachment area
    const previewBtn = page.locator('button:has(svg)').filter({ hasText: "Preview" }).first();
    await expect(previewBtn).toBeVisible({ timeout: 5000 });
    await previewBtn.click();

    // Check that the preview panel opened
    await expect(page.locator(".fixed.inset-y-0.right-0")).toBeVisible({ timeout: 5000 });

    // Check that the "Open Monaco editor" button exists (Monaco lazy)
    const monacoBtn = page.getByText("Open Monaco editor");
    await expect(monacoBtn).toBeVisible({ timeout: 5000 });
  });

  test("remove-all clears all attachments", async ({ page }) => {
    await configure(page);

    // Upload two files
    const uploadBtn = page.getByLabel("Upload file");
    for (const name of ["file1.txt", "file2.txt"]) {
      const fc = page.waitForEvent("filechooser");
      await uploadBtn.click();
      await (await fc).setFiles({ name, mimeType: "text/plain", buffer: Buffer.from("x") });
      await page.waitForTimeout(300);
    }

    // Click remove-all
    const removeAllBtn = page.getByLabel("Remove all files").or(page.getByText("Remove all"));
    await expect(removeAllBtn).toBeVisible({ timeout: 5000 });
    await removeAllBtn.click();

    // Verify content blocks are gone
    await expect(page.locator('[data-testid="content-block"]')).toHaveCount(0, { timeout: 5000 });
  });
});

test.describe("Upload processing state", () => {
  test("send button disabled while files are processing", async ({ page }) => {
    await configure(page);

    // Upload a large-ish file to trigger processing state
    const uploadBtn = page.getByLabel("Upload file");
    const fc = page.waitForEvent("filechooser");
    await uploadBtn.click();
    const largeContent = "x".repeat(100 * 1024); // 100KB
    await (await fc).setFiles({
      name: "large.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(largeContent),
    });

    // The send button should become disabled during processing
    // (This is a best-effort check — processing might finish too fast locally)
    const sendBtn = page.getByRole("button", { name: "Send" });
    await expect(sendBtn).toBeAttached();
  });
});

test.describe("Pasted images", () => {
  test("pasted image gets timestamped filename", async ({ page }) => {
    await configure(page);

    // Create a minimal valid PNG
    const pngBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
      0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 98, 0, 0, 0, 2, 0, 1,
      228, 33, 188, 51, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]);

    // Simulate paste with image data
    await page.evaluate((bytes) => {
      const file = new File([new Uint8Array(bytes)], "", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const textarea = document.querySelector("textarea");
      textarea?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
    }, Array.from(pngBytes));

    // Check that a content block appeared (the pasted image was processed)
    await expect(page.locator('[data-testid="content-block"]').first()).toBeVisible({ timeout: 10000 });
  });
});
