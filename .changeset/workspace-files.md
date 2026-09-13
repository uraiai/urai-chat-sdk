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
finishes and stay on the message in history. A file shows again on a later turn only when
that turn changed it, so "make the bars blue" puts the new chart under the reply that drew
it without re-listing everything else. The visitor's own uploads, scratch files and canvas
apps are not shown.

Bytes are fetched with the visitor header — never through a plain URL, which would let one
visitor of a widget read another's files — and shown through object URLs. Because an
object URL has the host page's origin, an SVG is never opened in a tab (that would run any
script in it as the embedding site); clicking one downloads it.

New API:

- core: `Transport.fetchThreadFile(threadId, path)`, `ServerMessage.files`, the `files`
  field on `tool_call_completed`, and the `WorkspaceFile` type.
- headless: `ChatMessage.files`, `StreamSlice.files`, `actions.fetchFileBlob(path)`, and the
  helpers `isImageFile`, `isScriptableFile`, `workspaceFileName`, `freshFiles`,
  `shownFileSizes`.
- React `/ui`: a `FileList` slot (`DefaultFileList`), a `files` prop on the
  `AssistantMessage`, `UserMessage`, `ErrorMessage` and `StreamingMessage` slot props, the
  `fileList` class-name key, and `files` / `openImage` labels. A replacement message slot
  that does not render `props.files` shows no files.

Requires a chat-service that sends `files` on widget messages and tool-call events.
