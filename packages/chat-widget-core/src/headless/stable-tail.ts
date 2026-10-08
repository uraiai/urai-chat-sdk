/**
 * Split the text at the last blank line that is not inside an open code
 * fence. The prefix is append-only, so it can be memoized and re-parsed
 * only when that boundary moves; only the small tail is re-parsed each
 * frame. Without this, a long message re-parses in full on every token.
 *
 * Shared by the React and Vue inline views.
 */
export function splitStableTail(text: string): { stable: string; tail: string } {
  let inFence = false;
  let lastBoundary = 0;
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s{0,3}(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence && line.trim() === "") lastBoundary = offset + line.length + 1;
    offset += line.length + 1;
  }
  return { stable: text.slice(0, lastBoundary), tail: text.slice(lastBoundary) };
}
