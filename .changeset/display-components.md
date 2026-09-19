---
"@uraiai/chat-widget-core": minor
"@uraiai/chat-widget-react": minor
"@uraiai/chat-widget-vue": minor
"@uraiai/chat-widget-svelte": minor
---

Let tools display rich components in the reply.

A uraiJS tool can now put UI in the conversation (an order card, a map, a confirm button)
by sending a command:

```ts
await meta.urai.sendCommand(meta.vars.thread_id, {
  command: "displayComponent",
  component: "OrderCard",
  props: { orderId: "o-1" },
});
```

The widget never runs anything the tool sent. It looks `component` up among the
components the host registered with `displayComponents` and renders it below the reply
text, above any files, with `props` and a `sendMessage` for replying as the visitor.
Components show live as the turn streams, and again from history. A name with no
registration is skipped with a one-time console warning. A component that throws is
contained: the imperative widget logs it and removes its element, and the React view
renders it inside an error boundary. The `command` event still fires for every command,
this one included.

`component` must start with a letter and use only letters, digits and `_ . : -` (at most
100 characters), and `props`, when present, must be an object. Anything else is not
rendered. Renderers are looked up as own properties, so a tool naming `constructor`
reaches nothing.

In the imperative widget (and the Vue, Svelte and `<UraiChatWidget>` wrappers) a renderer
is `(element, props, { component, sendMessage }) => cleanup?`. `element` is in the **host
page's DOM** and projected into the closed shadow root through a named slot. That way the
page's stylesheets apply and a framework app can be mounted into it. The cleanup runs when
the message leaves the transcript: new conversation, thread switch, user change, or
destroy. Renderers are read when the widget is created.

New API:

- core: the `displayComponents` option, `ComponentRenderer` / `ComponentRenderers` /
  `ComponentRenderContext`, `ServerMessage.components`, the `MessageComponent` type, and
  `parseDisplayComponent` / `DISPLAY_COMPONENT_COMMAND`.
- headless: `ChatMessage.components` and `StreamSlice.components`.
- React `/ui`: the `displayComponents` prop on `<Chat.Root>` / `<UraiChat>`, the
  `DisplayComponentProps` / `UraiChatDisplayComponents` types, a `ComponentList` slot
  (`DefaultComponentList`), the `DisplayComponent` renderer, a `displayComponents` prop on
  the message slot props, and the `componentList` class-name key. A replacement
  `AssistantMessage` or `StreamingMessage` slot that does not render
  `props.displayComponents` shows no components.
- React `<UraiChatWidget>`, Vue and Svelte: a `displayComponents` prop, and the renderer
  types re-exported.

Showing components from history requires a chat-service that saves `displayComponent`
commands and returns `components` on widget messages. Against an older one they show only
while the turn is live.
