import { defineComponent, h, type PropType } from "vue";
import type { ChatAttachment } from "@uraiai/chat-widget-core/headless";
import { useChatStore, usePresentation } from "../context";
import { useBlob, useObjectUrl } from "./object-url";

/**
 * Attachment previews.
 *
 * Deliberately not `<img src="url">` or `<a download>` on a server URL: the
 * request needs the `X-Widget-User-Id` header, and the path-embedded widget
 * token alone would let any visitor of the same widget read another
 * visitor's files. So remote attachments are fetched as blobs and shown
 * through an object URL, which is revoked on unmount.
 */
function nameOf(a: ChatAttachment): string {
  return a.kind === "local" ? a.fileName : a.attachment.file_name;
}

function mimeOf(a: ChatAttachment): string {
  return a.kind === "local" ? a.mimeType : a.attachment.mime_type;
}

function altOf(a: ChatAttachment): string {
  if (a.kind === "remote" && a.attachment.description) {
    return a.attachment.description;
  }
  return nameOf(a);
}

export const AttachmentPreview = defineComponent({
  name: "UraiAttachmentPreview",
  props: {
    attachment: { type: Object as PropType<ChatAttachment>, required: true },
  },
  setup(props) {
    const store = useChatStore();
    const presentation = usePresentation();
    const blob = useBlob(
      () => props.attachment,
      () => {
        const a = props.attachment;
        return a.kind === "local"
          ? a.file
          : // The store owns the transport; a view never fetches directly.
            (store.actions.fetchAttachmentBlob?.(a) ?? null);
      },
    );
    const url = useObjectUrl(() => blob.value);

    return () => {
      const a = props.attachment;
      const name = nameOf(a);
      if (mimeOf(a).startsWith("image/")) {
        return h("img", {
          class: "urai-attachment-image",
          "data-urai-part": "image-attachment",
          src: url.value ?? undefined,
          alt: altOf(a),
        });
      }
      const icons = presentation.icons;
      return h(
        "a",
        {
          class: "urai-attachment-file urai-focusable",
          "data-urai-part": "file-attachment",
          href: url.value ?? undefined,
          download: name,
          "aria-label": presentation.labels.downloadAttachment(name),
        },
        [
          h(icons.file),
          h("span", { class: "urai-attachment-file-name" }, name),
          h(icons.download),
        ],
      );
    };
  },
});
