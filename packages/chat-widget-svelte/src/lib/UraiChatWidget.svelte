<script lang="ts">
  import { untrack } from "svelte";
  import {
    createUraiChatWidget,
    type ComponentRenderers,
    type ConfigOverrides,
    type ThreadChangeReason,
    type WidgetBehavior,
    type WidgetController,
    type WidgetLayout,
    type WidgetTheme,
    type WidgetVars,
  } from "@uraiai/chat-widget-core";

  interface Props {
    widgetToken: string;
    userId: string;
    /** Chat-service origin. Defaults to the hosted Urai deployment. */
    baseUrl?: string;
    vars?: WidgetVars | null;
    /**
     * Knowledge collection **ids** scoping the conversation, on top of
     * whatever the assistant already carries. Ids, never slugs — the widget
     * token is public, so the unguessable id is what keeps the
     * organization's other collections out of reach.
     */
    collections?: string[] | null;
    /**
     * Open this thread instead of the visitor's last one — an id saved from
     * `onthreadchange`. Applies live: changing it opens the new thread in
     * place. Pair with `readOnly` for a past-conversation viewer.
     */
    threadId?: string | null;
    /**
     * Transcript only: no composer, switcher or welcome, and nothing is
     * written. Best with `mode="inline"`. Changing it remounts the widget.
     */
    readOnly?: boolean;
    theme?: Partial<WidgetTheme>;
    layout?: Partial<WidgetLayout>;
    behavior?: Partial<WidgetBehavior>;
    /**
     * Renderers for rich components, by name — a uraiJS tool asks for one
     * with `sendCommand(thread_id, { command: "displayComponent", component,
     * props })`. Read when the widget is created. See `ComponentRenderer` in
     * `@uraiai/chat-widget-core`.
     */
    displayComponents?: ComponentRenderers;
    /**
     * "floating" (default) appends a launcher to document.body;
     * "inline" renders the chat panel inside this component's div.
     * Changing mode remounts the widget.
     */
    mode?: "floating" | "inline";
    onready?: () => void;
    onopened?: () => void;
    onclosed?: () => void;
    onusermessage?: (content: string) => void;
    onassistantreply?: (content: string) => void;
    /**
     * A uraiJS tool sent a command via `meta.urai.sendCommand`. The
     * payload is the developer's JSON, verbatim — treat as untrusted.
     */
    oncommand?: (command: unknown) => void;
    onerror?: (error: string) => void;
    /**
     * The conversation moved to another thread, or to none. Save `threadId`
     * when `info.reason` is `"created"` to list the visitor's conversations.
     */
    onthreadchange?: (
      threadId: string | null,
      info: { previousThreadId: string | null; reason: ThreadChangeReason },
    ) => void;
  }

  let {
    widgetToken,
    userId,
    baseUrl = undefined,
    vars = null,
    collections = null,
    threadId = null,
    readOnly = false,
    theme = undefined,
    layout = undefined,
    behavior = undefined,
    displayComponents = undefined,
    mode = "floating",
    onready,
    onopened,
    onclosed,
    onusermessage,
    onassistantreply,
    oncommand,
    onerror,
    onthreadchange,
  }: Props = $props();

  let containerEl: HTMLDivElement | null = $state(null);
  let controller: WidgetController | null = null;
  let lastOverrides = "";
  let lastUserId = "";
  let lastVars = "";
  let lastCollections = "";
  let lastThreadId: string | null = null;

  /** Access the live controller via `bind:this` on the component. */
  export function getController(): WidgetController | null {
    return controller;
  }

  // Transport identity, mount topology and read-only are constructor-time: this
  // effect re-runs (destroy + recreate) when they change. All other
  // props are read inside untrack() so changing them does NOT remount —
  // the live-update effects below handle those.
  $effect(() => {
    const token = widgetToken;
    const base = baseUrl;
    const ro = readOnly;
    const container = mode === "inline" ? (containerEl ?? undefined) : undefined;
    if (mode === "inline" && !container) return;

    const c = untrack(() =>
      createUraiChatWidget({
        widgetToken: token,
        baseUrl: base,
        userId,
        vars,
        collections,
        threadId,
        readOnly: ro,
        theme,
        layout,
        behavior,
        displayComponents,
        container,
      }),
    );
    controller = c;
    untrack(() => {
      lastOverrides = JSON.stringify({ theme, layout, behavior });
      lastUserId = userId;
      lastVars = JSON.stringify(vars ?? null);
      lastCollections = JSON.stringify(collections ?? null);
      lastThreadId = threadId ?? null;
    });

    const subscriptions = [
      c.on("ready", () => onready?.()),
      c.on("opened", () => onopened?.()),
      c.on("closed", () => onclosed?.()),
      c.on("user-message", (e) => {
        if (e.type === "user-message") onusermessage?.(e.content);
      }),
      c.on("assistant-reply", (e) => {
        if (e.type === "assistant-reply") onassistantreply?.(e.content);
      }),
      c.on("command", (e) => {
        if (e.type === "command") oncommand?.(e.command);
      }),
      c.on("error", (e) => {
        if (e.type === "error") onerror?.(e.error);
      }),
      c.on("thread-change", (e) => {
        if (e.type === "thread-change") {
          onthreadchange?.(e.threadId, {
            previousThreadId: e.previousThreadId,
            reason: e.reason,
          });
        }
      }),
    ];

    return () => {
      subscriptions.forEach((off) => off());
      c.destroy();
      if (controller === c) controller = null;
    };
  });

  // theme/layout/behavior apply live via configure(); string-compare so
  // fresh object literals don't trigger a config re-render (which can
  // rebuild the panel and clear the conversation).
  $effect(() => {
    const json = JSON.stringify({ theme, layout, behavior });
    if (!controller || json === lastOverrides) return;
    lastOverrides = json;
    controller.configure(JSON.parse(json) as ConfigOverrides);
  });

  // A new threadId opens in place; the widget opens its first one itself.
  $effect(() => {
    const id = threadId ?? null;
    if (!controller || id === lastThreadId) return;
    lastThreadId = id;
    controller.openThread(id);
  });

  $effect(() => {
    if (!controller || userId === lastUserId) return;
    lastUserId = userId;
    controller.setUser({ id: userId });
  });

  $effect(() => {
    const json = JSON.stringify(vars ?? null);
    if (!controller || json === lastVars) return;
    lastVars = json;
    controller.setVars(JSON.parse(json) as WidgetVars | null);
  });

  // Serialized for the same reason as vars: a fresh array on every render
  // would otherwise PATCH the server each time the parent re-renders.
  $effect(() => {
    const json = JSON.stringify(collections ?? null);
    if (!controller || json === lastCollections) return;
    lastCollections = json;
    controller.setCollections(JSON.parse(json) as string[] | null);
  });
</script>

{#if mode === "inline"}
  <div bind:this={containerEl}></div>
{/if}
