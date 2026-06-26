# Urai Chat SDK

npm packages for embedding the Urai chat widget in React, Vue, and Svelte
apps — the same pre-built widget UI the script-tag embed mounts, as a typed
component.

| Package | Framework |
|---|---|
| [`@uraiai/chat-widget-core`](packages/chat-widget-core) | Framework-agnostic engine (`createUraiChatWidget`) |
| [`@uraiai/chat-widget-react`](packages/chat-widget-react) | React 18 / 19 |
| [`@uraiai/chat-widget-vue`](packages/chat-widget-vue) | Vue 3 |
| [`@uraiai/chat-widget-svelte`](packages/chat-widget-svelte) | Svelte 5 |

## Before you start: allow your origin

The chat-service validates the `Origin` header of every widget request
(including the SSE stream) against the widget's **allowed origins**. Add your
app's origin (e.g. `http://localhost:5173`, `https://app.example.com`) to the
widget's allowed origins in the Urai dashboard, or every request will fail
with a 403. This is the most common setup mistake.

## Quick start (React)

```bash
npm install @uraiai/chat-widget-react
```

```tsx
import { UraiChatWidget } from "@uraiai/chat-widget-react";

<UraiChatWidget
  widgetToken="<your widget token>"
  userId="<stable visitor id>"
/>
// baseUrl defaults to https://chat.app.urai.dev — pass it to point at a
// self-hosted chat-service deployment.
```

See the per-package READMEs for Vue, Svelte, and the vanilla core API.

## Development

```bash
pnpm install
pnpm build        # build all packages
pnpm test         # vitest (happy-dom)
pnpm typecheck
```

### Demo apps

`examples/{react,vue,svelte}-demo` are Vite apps wired to the workspace
packages. Each needs a `.env.local`:

```
VITE_URAI_BASE_URL=https://chat.app.urai.dev
VITE_URAI_WIDGET_TOKEN=<widget token>
```

…and the demo origin (`http://localhost:5173` / `5174` / `5175`) added to the
widget's allowed origins. Then `pnpm --filter react-demo dev`.

## Releasing

Versioning and publishing use [changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset          # describe the change
pnpm version            # bump versions + changelogs
pnpm release            # build + publish to npm
```

CI publishes automatically from `main` via `.github/workflows/release.yml`
(requires an `NPM_TOKEN` secret with publish rights to the `@uraiai` scope).
