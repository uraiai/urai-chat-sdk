---
"@uraiai/chat-widget-core": minor
"@uraiai/chat-widget-react": minor
"@uraiai/chat-widget-vue": minor
"@uraiai/chat-widget-svelte": minor
---

Show the files an assistant writes to the conversation's workspace.

When an agent turn writes a chart, a CSV or a report, the reply now carries it: images
(PNG, JPEG, GIF, WebP, AVIF, BMP and **SVG**) render inline at the bubble's width, and
anything else is a download link with its size. Files appear live as each tool call
finishes and stay on the message in history. Each file is listed under the turn that wrote
it last — the server stats the workspace rather than trusting what tool calls recorded — so
"make the bars blue" moves the chart to the reply that redrew it, even when the new file is
the same size. The visitor's own uploads, scratch files and canvas apps are not shown.

Once the conversation has shown a file, the header offers **Download all files**: the whole
workspace as one zip, named after the conversation. It holds everything the agent's scripts
wrote, including scratch files and canvas apps the transcript does not list. The zip is
buffered in memory before it is saved (a header-authenticated `fetch` cannot hand a stream
to the download manager), and the button shows a busy state until then.

Bytes are fetched with the visitor header — never through a plain URL, which would let one
visitor of a widget read another's files — and shown through object URLs. Because an
object URL has the host page's origin, an SVG is never opened in a tab (that would run any
script in it as the embedding site); clicking one downloads it.

New API:

- core: `Transport.fetchThreadFile(threadId, path)`,
  `Transport.fetchThreadArchive(threadId)` → `{ blob, fileName }`, `saveBlob(blob, name)`,
  `ServerMessage.files`, the `files` field on `tool_call_completed`, and the
  `WorkspaceFile` / `ThreadArchive` types.
- headless: `ChatMessage.files`, `StreamSlice.files`, `ChatState.archive`,
  `actions.fetchFileBlob(path)`, `actions.downloadArchive()`, and the helpers `isImageFile`,
  `isScriptableFile`, `workspaceFileName`, `freshFiles`, `shownFileVersions`, `fileVersion`,
  `withoutFiles`, `threadHasFiles`.
- React `/ui`: a `FileList` slot (`DefaultFileList`), a `files` prop on the
  `AssistantMessage`, `UserMessage`, `ErrorMessage` and `StreamingMessage` slot props, the
  `fileList` class-name key, and `files` / `openImage` labels. For the zip: an
  `ArchiveButton` slot (`DefaultArchiveButton`) and part (`Chat.ArchiveButton`,
  `ChatArchiveButton`), an `archiveButton` prop on `HeaderSlotProps`, the
  `useThreadArchive()` hook, the `archiveButton` class-name key, and
  `downloadAllFiles` / `downloadingFiles` labels. A replacement `Header` that does not
  render `props.archiveButton` shows no zip button. A replacement message slot
  that does not render `props.files` shows no files. A replacement `FileList` should key
  anything cached per file by `path` + `fileVersion(file)`, not `bytes`: a file can be rewritten
  at the same size.

Requires a chat-service that sends `files` on widget messages and tool-call events, with
`modified_at` on each (an older one falls back to comparing sizes). The
zip's name also needs `Access-Control-Expose-Headers: content-disposition` on widget
responses; without it the download is saved as `conversation-files.zip`.
