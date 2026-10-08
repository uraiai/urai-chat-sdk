---
"@uraiai/chat-widget-vue": minor
"@uraiai/chat-widget-core": patch
"@uraiai/chat-widget-react": patch
---

Add the modular inline chat to Vue: `@uraiai/chat-widget-vue/ui`.

A Vue 3 port of the React package's `/ui`, with the same parts, slot names, slot props,
`classNames` keys, `data-urai-part` hooks, CSS variables and stylesheet:

- `<UraiChat>` (the default tree) and `<ChatRoot>` with the compound parts (`Chat.Root`,
  `Header`, `ThreadTrigger`, `ArchiveButton`, `ThreadSwitcher`, `Viewport`, `MessageList`,
  `Message`, `StreamingMessage`, `Markdown`, `EmptyState`, `Composer`, `Footer`,
  `LiveRegion`, also exported flat as `ChatHeader`, `ChatComposer`, …). Same props as
  React's root; events are emitted (`@ready`, `@user-message`, `@assistant-reply`,
  `@command`, `@error`, `@thread-change`). The template ref is a `UraiChatHandle`.
- Composables under the React hooks' names: `useChatStatus`, `useThread`, `useThreadId`,
  `useMessages`, `useMessage`, `useStream`, `useComposer`, `useThreads`, `useAttachments`,
  `useThreadArchive`, `useChatActions`, `useChatSelector`, `useStickToBottom`, `useLabels`,
  `useIcons`, `useChatConfig`, `usePresentation`, `useChatStore`.
- Slot overrides through the `components` prop or, Vue-natively, named scoped slots of the
  same names (`<template #SendButton="{ buttonProps }">`). Composite slots receive their
  children pre-rendered as `VNode`s.
- Display components: `displayComponents: Record<string, Component>`; each receives
  `{ props, component, sendMessage }`, with the tool's props as one object. Own-property
  lookup, one warning per missing name, and an `onErrorCaptured` boundary per component.
  `displayComponentPropsOptions` declares the three props.
- Markdown through the core pipeline (`marked` + DOMPurify + KaTeX MathML) rather than
  react-markdown, with the same streaming stable-prefix split; tool-call markers render
  as the real `ToolCallCard` slot.
- Files, attachments, the workspace zip, sub-agent cards, reasoning, tool activity, the
  thread switcher, read-only threads and the live region, as in React.
- `@uraiai/chat-widget-vue/styles.css`, or auto-injection.

The main entry gains `vueComponentRenderer(Component, { setup?, appContext? })` and
`vueComponentRenderers(map, options)`, which turn Vue components into core
`ComponentRenderer`s, so the same component works with the floating `<UraiChatWidget>`.

Core: the inline views' stylesheet (`componentCss`, `stylesheet`, `ensureStyles`) moves to
`@uraiai/chat-widget-core/theme`, and `DEFAULT_LABELS`, `resolveLabels`, `cx`,
`resolveClass`, `splitStableTail` and the label/class-name types to
`@uraiai/chat-widget-core/headless`, so React and Vue share one copy. The stylesheet gains a
few rules for the Vue markdown blocks. React re-exports all of these unchanged.
