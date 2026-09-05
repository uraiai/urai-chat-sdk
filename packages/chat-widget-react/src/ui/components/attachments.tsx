"use client";

import { useEffect, useState } from "react";
import type { ChatAttachment } from "@uraiai/chat-widget-core/headless";
import { useChatStore } from "../context";
import { useIcons, useLabels } from "../hooks";

/**
 * Attachment previews.
 *
 * Deliberately not `<img src={url}>` or `<a download>`: the request
 * needs the `X-Widget-User-Id` header, and the path-embedded widget
 * token alone would let any visitor of the same widget read another
 * visitor's files. So remote attachments are fetched as blobs and shown
 * through an object URL, which is revoked on unmount.
 */
function useAttachmentUrl(attachment: ChatAttachment): string | null {
  const store = useChatStore();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    async function resolve() {
      if (attachment.kind === "local") {
        objectUrl = URL.createObjectURL(attachment.file);
      } else {
        // The store owns the transport; a view never fetches directly.
        const blob = await store.actions
          .fetchAttachmentBlob?.(attachment)
          .catch(() => null);
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
      }
      if (revoked) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setUrl(objectUrl);
    }
    void resolve();

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment, store]);

  return url;
}

function nameOf(a: ChatAttachment): string {
  return a.kind === "local" ? a.fileName : a.attachment.file_name;
}

function mimeOf(a: ChatAttachment): string {
  return a.kind === "local" ? a.mimeType : a.attachment.mime_type;
}

function altOf(a: ChatAttachment): string {
  // The server already returns a description and today's widget ignores it.
  if (a.kind === "remote" && a.attachment.description) {
    return a.attachment.description;
  }
  return nameOf(a);
}

export function AttachmentPreview({ attachment }: { attachment: ChatAttachment }) {
  const url = useAttachmentUrl(attachment);
  const labels = useLabels();
  const FileIcon = useIcons().file;
  const DownloadIcon = useIcons().download;
  const name = nameOf(attachment);

  if (mimeOf(attachment).startsWith("image/")) {
    return (
      <img
        className="urai-attachment-image"
        data-urai-part="image-attachment"
        src={url ?? undefined}
        alt={altOf(attachment)}
      />
    );
  }

  return (
    <a
      className="urai-attachment-file urai-focusable"
      data-urai-part="file-attachment"
      href={url ?? undefined}
      download={name}
      aria-label={labels.downloadAttachment(name)}
    >
      <FileIcon />
      <span className="urai-attachment-file-name">{name}</span>
      <DownloadIcon />
    </a>
  );
}
