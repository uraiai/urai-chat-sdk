"use client";

import { useMemo } from "react";
import {
  isImageFile,
  isScriptableFile,
  workspaceFileName,
  type WorkspaceFile,
} from "@uraiai/chat-widget-core/headless";
import { useChatStore } from "../context";
import { useIcons, useLabels } from "../hooks";
import { useBlob, useObjectUrl } from "./object-url";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One file the assistant wrote to the thread's workspace: a picture
 * inline, anything else a download link.
 *
 * Fetched as a blob through the store for the same reason attachments
 * are — the read is scoped to this visitor only by a header.
 *
 * A raster image opens full size in a new tab. An **SVG downloads**
 * instead, from a copy retyped to `application/octet-stream`: an object
 * URL has the host page's origin, so opening an agent-written SVG in a
 * tab would run its script as the embedding site. Inside the `<img>` it
 * is inert.
 */
export function WorkspaceFilePreview({ file }: { file: WorkspaceFile }) {
  const store = useChatStore();
  const labels = useLabels();
  const FileIcon = useIcons().file;
  const DownloadIcon = useIcons().download;
  const name = workspaceFileName(file.path);
  const scriptable = isScriptableFile(file.path);

  const blob = useBlob(`${file.path}@${file.bytes}`, () =>
    store.actions.fetchFileBlob?.(file.path) ?? null,
  );
  const viewUrl = useObjectUrl(blob);
  const inertBlob = useMemo(
    () =>
      blob && scriptable ? new Blob([blob], { type: "application/octet-stream" }) : null,
    [blob, scriptable],
  );
  const inertUrl = useObjectUrl(inertBlob);
  const saveUrl = scriptable ? inertUrl : viewUrl;

  if (isImageFile(file.path)) {
    const img = (
      <img
        className="urai-attachment-image urai-file-image"
        data-urai-part="image-file"
        src={viewUrl ?? undefined}
        alt={name}
        title={file.path}
      />
    );
    return scriptable ? (
      <a
        className="urai-file-image-link urai-focusable"
        href={saveUrl ?? undefined}
        download={name}
        aria-label={labels.downloadAttachment(name)}
      >
        {img}
      </a>
    ) : (
      <a
        className="urai-file-image-link urai-focusable"
        href={viewUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-label={labels.openImage(name)}
      >
        {img}
      </a>
    );
  }

  return (
    <a
      className="urai-attachment-file urai-focusable"
      data-urai-part="file-download"
      href={saveUrl ?? undefined}
      download={name}
      title={file.path}
      aria-label={labels.downloadAttachment(name)}
    >
      <FileIcon />
      <span className="urai-attachment-file-name">{name}</span>
      {file.bytes > 0 && <span className="urai-file-size">{formatBytes(file.bytes)}</span>}
      <DownloadIcon />
    </a>
  );
}
