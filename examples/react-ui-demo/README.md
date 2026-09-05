# react-ui-demo

A harness for `@uraiai/chat-widget-react/ui` — the modular inline chat.

It is not meant to look like a product. It exists to make every seam
observable: what `vars` the server actually received, when identity
changed, which parts are overridden, and whether the chat follows the
host app's dark mode.

## Running it

```bash
pnpm --filter react-ui-demo dev   # http://localhost:5178
```

Then, **before anything works**, add `http://localhost:5178` to the
widget's allowed origins (Security tab in the widget designer). Widget
auth is `(token, Origin ∈ allowed_origins)`, so without it every request
403s. The app shows a red banner saying exactly that if it happens.

Point it at your own service and widget with:

```bash
VITE_URAI_BASE_URL=http://localhost:5174 \
VITE_URAI_WIDGET_TOKEN=<your-token> \
pnpm --filter react-ui-demo dev
```

## What it exercises

**`vars` — the context the assistant sees.** The three route buttons
stand in for pages of a host app, each with its own `vars`. Switching
them changes the prop without remounting the widget:

- an existing thread is PATCHed (`PATCH /threads/{id}`),
- a thread created later carries the new values in its create body,
- passing an equal object again sends nothing, because the comparison is
  by value — a fresh object literal per render must not be a request per
  render.

`ref.setVars(…)` and `ref.startConversation(vars)` do the same
imperatively, for host code outside the React tree.
`startConversation` is lazy: it buffers the vars and sends nothing until
the visitor actually types, so "every navigation calls
startConversation" stays free.

**Identity.** Switching visitor re-scopes the transport and clears the
transcript without tearing down the widget or re-fetching config.

**Presentation**, three ways:

- `default` — as shipped.
- `branded` — a theme token, two swapped slots (`Header` wraps
  `DefaultHeader`, `EmptyState` is replaced outright), and an appended
  class on the composer.
- `unstyled` — every default class dropped, styled entirely from
  `app.css`. Note how little CSS that takes.

**Host dark mode.** The checkbox sets `color-scheme` on `<html>`. The
chat inherits it with no JS and no prop, because `colorScheme` defaults
to `"host"` — a chat embedded in someone's product should follow that
product.

## Note on host CSS

`app.css` deliberately includes a global `button { … }` reset, because
almost every real app has one. It is there to prove the widget survives
it: component rules are scoped as `.urai-root :where(.urai-x)`, which
clears a bare element selector while still losing to a single host class
or Tailwind utility.
