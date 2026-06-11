<script lang="ts">
  import { untrack } from "svelte";
  import {
    createUraiChatWidget,
    type ConfigOverrides,
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
    theme?: Partial<WidgetTheme>;
    layout?: Partial<WidgetLayout>;
    behavior?: Partial<WidgetBehavior>;
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
    onerror?: (error: string) => void;
  }

  let {
    widgetToken,
    userId,
    baseUrl = undefined,
    vars = null,
    theme = undefined,
    layout = undefined,
    behavior = undefined,
    mode = "floating",
    onready,
    onopened,
    onclosed,
    onusermessage,
    onassistantreply,
    onerror,
  }: Props = $props();

  let containerEl: HTMLDivElement | null = $state(null);
  let controller: WidgetController | null = null;
  let lastOverrides = "";
  let lastUserId = "";
  let lastVars = "";

  /** Access the live controller via `bind:this` on the component. */
  export function getController(): WidgetController | null {
    return controller;
  }

  // Transport identity and mount topology are constructor-time: this
  // effect re-runs (destroy + recreate) when they change. All other
  // props are read inside untrack() so changing them does NOT remount —
  // the live-update effects below handle those.
  $effect(() => {
    const token = widgetToken;
    const base = baseUrl;
    const container = mode === "inline" ? (containerEl ?? undefined) : undefined;
    if (mode === "inline" && !container) return;

    const c = untrack(() =>
      createUraiChatWidget({
        widgetToken: token,
        baseUrl: base,
        userId,
        vars,
        theme,
        layout,
        behavior,
        container,
      }),
    );
    controller = c;
    untrack(() => {
      lastOverrides = JSON.stringify({ theme, layout, behavior });
      lastUserId = userId;
      lastVars = JSON.stringify(vars ?? null);
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
      c.on("error", (e) => {
        if (e.type === "error") onerror?.(e.error);
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
</script>

{#if mode === "inline"}
  <div bind:this={containerEl}></div>
{/if}
