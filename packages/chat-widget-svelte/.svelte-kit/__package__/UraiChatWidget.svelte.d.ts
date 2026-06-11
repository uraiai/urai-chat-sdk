import { type WidgetBehavior, type WidgetController, type WidgetLayout, type WidgetTheme, type WidgetVars } from "@uraiai/chat-widget-core";
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
declare const UraiChatWidget: import("svelte").Component<Props, {
    getController: () => WidgetController | null;
}, "">;
type UraiChatWidget = ReturnType<typeof UraiChatWidget>;
export default UraiChatWidget;
