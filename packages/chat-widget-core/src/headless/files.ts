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
 * Which version of a file this is: when it was written, or its size on a
 * server too old to say. Two listings of an unchanged file agree on it; a
 * rewrite changes it even when the size stays the same.
 */
export function fileVersion(file: WorkspaceFile): string {
  return file.modified_at ?? `${file.bytes} bytes`;
}

/**
 * The version of every path the transcript shows. The server lists a file
 * only on the message that wrote it last, so each path appears once; later
 * messages win regardless.
 */
export function shownFileVersions(messages: ChatMessage[]): Map<string, string> {
  const versions = new Map<string, string>();
  for (const m of messages) {
    for (const f of m.files ?? []) versions.set(f.path, fileVersion(f));
  }
  return versions;
}

/**
 * The files a live turn should show, given the workspace listing its latest
 * tool call reported: those new to the transcript or rewritten since it
 * showed them.
 *
 * Without it every turn after the first chart would re-list every file,
 * because each listing is cumulative. Pair it with {@link withoutFiles}
 * when the turn is committed, which is what the server's history does.
 */
export function freshFiles(
  listing: WorkspaceFile[],
  shown: Map<string, string>,
): WorkspaceFile[] {
  return listing.filter((f) => shown.get(f.path) !== fileVersion(f));
}

/**
 * `messages` with `files`' paths removed from them — for committing a turn
 * that rewrote a file an earlier message showed. History lists a file only
 * under the turn that wrote it last, so the transcript agrees with a reload.
 */
export function withoutFiles(
  messages: ChatMessage[],
  files: WorkspaceFile[],
): ChatMessage[] {
  if (files.length === 0) return messages;
  const moved = new Set(files.map((f) => f.path));
  return messages.map((m) => {
    if (!m.files?.some((f) => moved.has(f.path))) return m;
    const kept = m.files.filter((f) => !moved.has(f.path));
    return { ...m, files: kept.length > 0 ? kept : undefined };
  });
}
