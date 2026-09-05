# Urai Chat SDK

npm packages for embedding Urai chat in React, Vue, and Svelte apps.

Two shapes are available. The **floating widget** is the pre-built UI the
script-tag embed mounts, wrapped as a typed component — a launcher and popup
panel, sealed off in a shadow root. In React there is also a **modular chat**
(`@uraiai/chat-widget-react/ui`): inline, built from native React components
you can replace one by one, for a chat that lives inside your product and
should look like it.

| Package | Framework |
|---|---|
| [`@uraiai/chat-widget-core`](packages/chat-widget-core) | Framework-agnostic engine (`createUraiChatWidget`), plus `/headless` for the state machine alone |
| [`@uraiai/chat-widget-react`](packages/chat-widget-react) | React 18 / 19 — floating widget **and** the modular `/ui` chat |
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

Or the modular inline chat, which fills the box you give it and can be
restyled or rebuilt part by part:

```tsx
import { UraiChat } from "@uraiai/chat-widget-react/ui";

<div className="h-dvh">
  <UraiChat widgetToken="<your widget token>" userId="<stable visitor id>" />
</div>;
```

See the [React README](packages/chat-widget-react) for slots, tokens, hooks and
the compound API, and the per-package READMEs for Vue, Svelte and the vanilla
core.

## Development

```bash
pnpm install
pnpm build        # build all packages
pnpm test         # vitest (node / jsdom / happy-dom projects)
pnpm typecheck
```

### Demo apps

`examples/{react,vue,svelte}-demo` are Vite apps wired to the workspace
packages, and `examples/react-ui-demo` (port 5178) is a harness for the
modular chat — vars, identity switching, three styling levels and host dark
mode. Each needs a `.env.local`:

```
VITE_URAI_BASE_URL=https://chat.app.urai.dev
VITE_URAI_WIDGET_TOKEN=<widget token>
```

…and the demo origin (`http://localhost:5173` / `5174` / `5175` / `5178`)
added to the widget's allowed origins. Then `pnpm --filter react-demo dev`, or
`pnpm --filter react-ui-demo dev`.

## Releasing

Versioning and publishing use [changesets](https://github.com/changesets/changesets).
Every PR that changes a package carries one:

```bash
pnpm changeset          # describe the change; commit the generated file
```

**Publishing is manual, and takes two runs of the `Release` workflow.** Automatic
releases on push were deliberately disabled (`43eeb4a`), so `.github/workflows/release.yml`
is `workflow_dispatch`-only. `changesets/action` behaves differently depending on whether
unconsumed changesets exist, which is why it takes two:

1. **Dispatch `Release` (run 1).** Changesets exist, so the action opens a
   **"Version Packages"** PR that bumps versions and writes `CHANGELOG.md`. It publishes
   nothing.
2. **Review and merge that PR.** Check the computed versions and the changelog bodies.
3. **Dispatch `Release` (run 2).** No changesets remain, so the action runs
   `pnpm release` (`pnpm build && changeset publish`), pushes the git tags, and publishes
   to npm.

Requires an `NPM_TOKEN` secret with publish rights to the `@uraiai` scope. The workflow
runs `pnpm typecheck` and `pnpm test` before either step.

Before run 1, verify the packed tarballs resolve — CI cannot catch a bad `exports` entry:

```bash
pnpm build && pnpm -r --filter './packages/*' exec npm pack
# install the tarballs into a scratch app and import every subpath
```

`pnpm version` and `pnpm release` exist as local escape hatches, but prefer the workflow
so the tags and the npm publish stay in step.
