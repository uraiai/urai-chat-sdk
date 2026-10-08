# vue-ui-demo

A harness for `@uraiai/chat-widget-vue/ui` — the modular inline chat, in
Vue. It is the twin of [`react-ui-demo`](../react-ui-demo) and exercises the
same seams: what `vars` the server actually received, when identity changed,
which parts are overridden, and whether the chat follows the host app's dark
mode.

## Running it

```bash
pnpm --filter vue-ui-demo dev   # http://localhost:5179
```

Then, **before anything works**, add `http://localhost:5179` to the
widget's allowed origins (Security tab in the widget designer). Widget
auth is `(token, Origin ∈ allowed_origins)`, so without it every request
403s. The app shows a red banner saying exactly that if it happens.

Point it at your own service and widget with:

```bash
VITE_URAI_BASE_URL=http://localhost:5174 \
VITE_URAI_WIDGET_TOKEN=<your-token> \
pnpm --filter vue-ui-demo dev
```

(or put both in `examples/vue-ui-demo/.env.local`).

## What it exercises

**`vars` — the context the assistant sees.** The route buttons change the
`vars` prop without remounting the chat: an existing thread is PATCHed, a
thread created later carries the new values, and an equal object passed
again sends nothing. `ref.setVars(…)` and `ref.startConversation(vars)` do
the same through the template ref (`UraiChatHandle`).

**Identity.** Switching visitor re-scopes the transport and clears the
transcript without tearing down the chat.

**Presentation**, three ways:

- `default` — as shipped.
- `branded` — a theme token, the `Header` slot wrapping `DefaultHeader`
  through `components`, the empty state replaced with a **named scoped
  slot** (`<template #EmptyState>`), and an appended class on the composer.
- `unstyled` — every default class dropped, styled entirely from
  `app.css`.

**Display components.** `OrderCard.vue` (a plain SFC declaring
`displayComponentPropsOptions`) and `BrokenCard` (throws on render) are
registered through `displayComponents`. The chat looks the tool's
`component` name up and renders your component with
`{ props, component, sendMessage }` inside an error boundary. Only a tool
can trigger one, so seeing it work needs an agent on the other end —
[`react-ui-demo/agent/`](../react-ui-demo/agent) has a system prompt that
does nothing but this.

**Saved conversations.** `@thread-change` with reason `created` saves each
new thread id; opening one shows it read-only beside the live chat, and
changing `thread-id` loads the next thread in place.

**Host dark mode.** The checkbox sets `color-scheme` on `<html>`, and the
chat follows with no prop, because `colorScheme` defaults to `"host"`.

`app.css` deliberately includes a global `button { … }` reset, because
almost every real app has one; the chat's scoped rules survive it.
