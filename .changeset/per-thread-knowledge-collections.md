---
"@uraiai/chat-widget-core": minor
"@uraiai/chat-widget-react": minor
"@uraiai/chat-widget-vue": minor
"@uraiai/chat-widget-svelte": minor
---

Scope a conversation's knowledge search from the host: a new `collections` option and
`setCollections()` control, available on the imperative widget, the headless client and
all three framework wrappers.

The ids are **unioned** with whatever collections the assistant already has attached —
they add scope the agent's author could not have named at definition time, and can never
narrow or replace the agent's own. Scope is per conversation, applied at thread create
and patchable afterwards, so every turn of a thread inherits it without the host passing
it on each send.

```tsx
<UraiChatWidget
  widgetToken={token}
  userId={visitorId}
  collections={[billingCollectionId]}   // ids, never slugs
/>
```

Collection **ids**, not slugs: the widget token lives in public page source, so the
unguessable id is what keeps the organization's other collections out of reach. The
server filters every id against the owning organization and rejects the whole request if
one doesn't belong to it — a rejected thread create surfaces as an `error` event with the
panel still usable, so a stale id is visible rather than silently narrowing what the
assistant can read.

`startConversation()` (and the headless `newConversation()`) now also accept
`{ vars, collections }`. Passing a bare vars object still works exactly as before.

Requires a chat-service with per-thread knowledge collections; older deployments ignore
the field.
