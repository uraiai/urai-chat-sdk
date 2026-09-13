---
"@uraiai/chat-widget-core": minor
"@uraiai/chat-widget-react": minor
"@uraiai/chat-widget-vue": minor
"@uraiai/chat-widget-svelte": minor
---

Hide the persistent tool-call chip by default, behind a new `behavior.showToolCalls`
opt-in.

A turn that calls tools several times used to leave a "Working" / "Code action" chip
behind at every `<urai-tool-call>` marker. In a 380px panel that stacks into a column of
near-identical rows spending vertical space on something the model's own narration
already says. The chips are now off unless the embedder asks for them:

```tsx
<UraiChatWidget
  widgetToken={token}
  userId={visitorId}
  behavior={{ showToolCalls: true }}
/>
```

The **live activity row** on a streaming bubble ("Running code…", "Searching the web…")
is unchanged and always shows — it is transient, replaces itself as calls come and go,
and is the only feedback during a long silent tool call.

`behavior.dev` still implies the chips, so developer mode is unchanged. With the flag off
the markers are stripped from the prose entirely rather than rendered empty, and in the
React view the `ToolCallCard` slot is not mounted at all — an override slot obeys the
same switch as the default one.
