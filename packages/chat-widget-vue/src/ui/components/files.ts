import { computed, defineComponent, h, type PropType } from "vue";
import {
  fileVersion,
  isImageFile,
  isScriptableFile,
  workspaceFileName,
  type WorkspaceFile,
} from "@uraiai/chat-widget-core/headless";
import { useChatStore, usePresentation } from "../context";
import { useBlob, useObjectUrl } from "./object-url";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One file the assistant wrote to the thread's workspace: a picture inline,
 * anything else a download link.
 *
 * Fetched as a blob through the store for the same reason attachments are —
 * the read is scoped to this visitor only by a header.
 *
 * A raster image opens full size in a new tab. An **SVG downloads** instead,
 * from a copy retyped to `application/octet-stream`: an object URL has the
 * host page's origin, so opening an agent-written SVG in a tab would run its
 * script as the embedding site. Inside the `<img>` it is inert.
 */
export const WorkspaceFilePreview = defineComponent({
  name: "UraiWorkspaceFilePreview",
  props: { file: { type: Object as PropType<WorkspaceFile>, required: true } },
  setup(props) {
    const store = useChatStore();
    const presentation = usePresentation();

    // Keyed by version, not size: a rewrite at the same byte count is still
    // new bytes, and a stale key would keep showing the old picture.
    const blob = useBlob(
      () => `${props.file.path}@${fileVersion(props.file)}`,
      () => store.actions.fetchFileBlob?.(props.file.path) ?? null,
    );
    const scriptable = computed(() => isScriptableFile(props.file.path));
    const viewUrl = useObjectUrl(() => blob.value);
    const inertBlob = computed(() =>
      blob.value && scriptable.value
        ? new Blob([blob.value], { type: "application/octet-stream" })
        : null,
    );
    const inertUrl = useObjectUrl(() => inertBlob.value);

    return () => {
      const { file } = props;
      const labels = presentation.labels;
      const icons = presentation.icons;
      const name = workspaceFileName(file.path);
      const saveUrl = scriptable.value ? inertUrl.value : viewUrl.value;

      if (isImageFile(file.path)) {
        const img = h("img", {
          class: "urai-attachment-image urai-file-image",
          "data-urai-part": "image-file",
          src: viewUrl.value ?? undefined,
          alt: name,
          title: file.path,
        });
        return scriptable.value
          ? h(
              "a",
              {
                class: "urai-file-image-link urai-focusable",
                href: saveUrl ?? undefined,
                download: name,
                "aria-label": labels.downloadAttachment(name),
              },
              [img],
            )
          : h(
              "a",
              {
                class: "urai-file-image-link urai-focusable",
                href: viewUrl.value ?? undefined,
                target: "_blank",
                rel: "noreferrer",
                "aria-label": labels.openImage(name),
              },
              [img],
            );
      }

      return h(
        "a",
        {
          class: "urai-attachment-file urai-focusable",
          "data-urai-part": "file-download",
          href: saveUrl ?? undefined,
          download: name,
          title: file.path,
          "aria-label": labels.downloadAttachment(name),
        },
        [
          h(icons.file),
          h("span", { class: "urai-attachment-file-name" }, name),
          file.bytes > 0 ? h("span", { class: "urai-file-size" }, formatBytes(file.bytes)) : null,
          h(icons.download),
        ],
      );
    };
  },
});
