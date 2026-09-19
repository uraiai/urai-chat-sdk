import { type ComponentRenderers, type ThreadChangeReason, type WidgetBehavior, type WidgetController, type WidgetLayout, type WidgetTheme, type WidgetVars } from "@uraiai/chat-widget-core";
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
    onthreadchange?: (threadId: string | null, info: {
        previousThreadId: string | null;
        reason: ThreadChangeReason;
    }) => void;
}
declare const UraiChatWidget: import("svelte").Component<Props, {
    getController: () => WidgetController | null;
}, "">;
type UraiChatWidget = ReturnType<typeof UraiChatWidget>;
export default UraiChatWidget;
