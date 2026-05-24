/**
 * Detects if a string looks like a unified diff or patch.
 * Matches patterns like:
 *   diff --git a/file b/file
 *   --- a/file
 *   +++ b/file
 *   @@ -1,3 +1,4 @@
 */
export function isDiffContent(text: string): boolean {
  if (typeof text !== "string" || text.length < 10) return false;
  const head = text.slice(0, 500);
  return (
    head.includes("diff --git") ||
    /^---\s+\S+/.test(head) ||
    /^\+\+\+\s+\S+/.test(head) ||
    /^@@\s+-\d+/.test(head)
  );
}
