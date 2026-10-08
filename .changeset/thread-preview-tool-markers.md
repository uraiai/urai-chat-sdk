---
"@uraiai/chat-widget-core": patch
"@uraiai/chat-widget-react": patch
"@uraiai/chat-widget-vue": patch
---

Strip `<urai-tool-call>` markers, including ones cut off by the excerpt length, from thread-list previews and preview search. Adds `threadPreview()` to `@uraiai/chat-widget-core/headless`.
