---
"@uraiai/chat-widget-core": patch
---

Fix "new conversation" resuming the conversation it was meant to leave.

`newConversation()` cleared the thread id from state but not from storage. `ensureThread`
consults the persisted id before it considers creating anything, so the next message
resumed the old thread and re-hydrated its transcript — the visitor pressed the button,
watched the panel clear, typed, and saw the old conversation come back. The imperative
widget clears storage in `reset()`; that step was missed when the store was extracted.

A pending reset now also skips the cached thread outright in `ensureThread`, so clearing
storage is not the only thing standing between the visitor and their old conversation.

Only the new React `/ui` chat was affected; `<UraiChatWidget>`, Vue and Svelte go through
`ui.ts`, which always cleared storage.
