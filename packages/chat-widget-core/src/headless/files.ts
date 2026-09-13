/**
 * Workspace files — what the assistant wrote to the thread's filesystem
 * (a chart, a CSV, a report), shown on the message that produced it.
 *
 * DOM-free and shared by every view, so the imperative widget and the
 * React one agree on which files a message shows and which of them
 * render as pictures.
 */
import type { WorkspaceFile } from "../transport";
import type { ChatMessage, StreamSlice } from "./types";

/** Last path segment: `/out/report.xlsx` → `report.xlsx`. */
export function workspaceFileName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

/**
 * Whether a file renders inline as a picture rather than a download chip.
 * By extension, because that is all a listing carries — and it is what
 * the server's `Content-Type` is guessed from too.
 */
export function isImageFile(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(path);
}

/**
 * Whether a file can carry script when navigated to. A view may show one
 * in an `<img>` — images run no script — but must never open its object
 * URL in a tab: that URL has the **host page's** origin, and the file
 * was written by agent code a prompt injection can steer.
 */
export function isScriptableFile(path: string): boolean {
  return /\.(svg|html?|xhtml|xml)$/i.test(path);
}

/**
 * Whether to offer the thread's files as a zip: once the transcript shows
 * at least one. The zip holds more than that — uploads, scratch files and
 * canvas apps too — but a conversation that has shown the visitor no file
 * has nothing they would think to download.
 */
export function threadHasFiles(
  messages: ChatMessage[],
  stream?: StreamSlice | null,
): boolean {
  return (
    !!stream?.files.length || messages.some((m) => (m.files?.length ?? 0) > 0)
  );
}

/**
 * The size every path had the last time any of these messages showed it.
 * Later messages win, since a file is repeated only where it changed.
 */
export function shownFileSizes(messages: ChatMessage[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const m of messages) {
    for (const f of m.files ?? []) sizes.set(f.path, f.bytes);
  }
  return sizes;
}

/**
 * The files a live turn should show, given the workspace listing its latest
 * tool call reported: those new to the thread or whose size changed.
 *
 * This is the same rule the server applies to history, so a message does
 * not gain or lose files when it moves from the stream to the transcript.
 * Without it every turn after the first chart would re-list every file,
 * because each listing is cumulative.
 */
export function freshFiles(
  listing: WorkspaceFile[],
  shown: Map<string, number>,
): WorkspaceFile[] {
  return listing.filter((f) => shown.get(f.path) !== f.bytes);
}
