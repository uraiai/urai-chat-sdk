---
"@uraiai/chat-widget-core": minor
"@uraiai/chat-widget-react": minor
"@uraiai/chat-widget-vue": minor
"@uraiai/chat-widget-svelte": minor
---

Save conversations and show them again, read-only.

**Thread ids reach the host.** A new `thread-change` event fires whenever the conversation
moves to another thread, with `threadId`, `previousThreadId` and a `reason`: `created`,
`restored`, `selected`, `opened`, `reset` or `user-changed`. Save the id on `created` to
list a visitor's conversations in your own app. It fires before the first message is
sent, so you get the id even if that send fails.

**Open a saved thread.** A new `threadId` option opens that thread instead of the
visitor's last one. Changing it later opens the new thread in place, without a remount.
A thread that is not this visitor's shows "This conversation is unavailable." and fires
`error`. Pass the `userId` of the visitor who owns the thread.

**`readOnly`** shows the transcript only: no composer, switcher or welcome message, and
the header shows the thread's title. The widget itself refuses writes, so hiding the
composer is not the only guard. Sends, uploads and resets do nothing. Vars and
collections are never written to the thread. The visitor's saved thread in
`localStorage` is left alone, so opening an old conversation never changes the one their
live chat resumes. Files and "Download all files" still work.

New API:

- core: `threadId` / `readOnly` options, `WidgetController.openThread`, `getThreadId`
  and `getThreadSummary`, the `thread-change` event and `ThreadChangeReason` type,
  `WidgetHttpError` (a transport error with its HTTP `status`), and
  `Transport.getThread`.
- headless: `ChatState.readOnly`, `thread` and `threadLoad`, the `openThread` and
  `fetchThreadSummary` actions, and `threadId` / `readOnly` on `createChatClient` and
  `createChatStore`. `ChatTransport` gains `getThread`, so a custom transport must
  implement it.
- React `/ui`: `threadId`, `readOnly` and `onThreadChange` props; `openThread`,
  `getThreadId` and `getThreadSummary` on the handle; `useThreadId()` and `useThread()`;
  the `loadingConversation`, `conversationUnavailable` and `conversationLoadFailed`
  labels; and a `notice` prop on the `EmptyState` slot.
- React `<UraiChatWidget>`, Vue and Svelte: `threadId`, `readOnly`, and
  `onThreadChange` / `@thread-change` / `onthreadchange`. Changing `readOnly`
  remounts the widget.

Thread titles (`getThreadSummary`, the read-only header) need a chat-service with
`GET /api/widget/v1/{token}/threads/{id}`. Against an older one the transcript still
shows, under the brand name.
