// Schema for the widget config delivered by the server plus the
// options/configure overrides that merge on top of it.

export interface WidgetTheme {
  primaryColor: string;
  primaryTextColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  userBubbleColor: string;
  userBubbleTextColor: string;
  assistantBubbleColor: string;
  assistantBubbleTextColor: string;
  fontFamily: string;
  radius: string;
  shadow: string;
  dark: boolean | "system";
}

export interface WidgetLayout {
  mode: "floating" | "inline";
  position: "bottom-right" | "bottom-left";
  width: string;
  height: string;
  buttonLabel: string;
  brandName: string;
  brandLogoUrl: string | null;
  showHeader: boolean;
}

export interface WidgetBehavior {
  welcomeMessage: string;
  suggestedQuestions: string[];
  placeholder: string;
  sendLabel: string;
  footerText: string;
  disclaimer: string;
  resetOnClose: boolean;
  persistAcrossSessions: boolean;
  newConversationLabel: string;
  /**
   * Developer mode. When true, agent-mode code-action fences
   * (```js-action```) and `<urai-tool-call>` markers are rendered
   * inline in assistant prose so developers can see exactly what the
   * agent ran while iterating on prompts/tools. When false (default),
   * both are stripped — embedders' end-users see the model's
   * natural-language narration plus the activity pill, never raw code.
   */
  dev: boolean;
}

export interface ResolvedConfig {
  theme: WidgetTheme;
  layout: WidgetLayout;
  behavior: WidgetBehavior;
}

export const DEFAULT_THEME: WidgetTheme = {
  primaryColor: "#5b21b6",
  primaryTextColor: "#ffffff",
  backgroundColor: "#ffffff",
  surfaceColor: "#f8fafc",
  textColor: "#0f172a",
  mutedColor: "#64748b",
  borderColor: "#e2e8f0",
  userBubbleColor: "#5b21b6",
  userBubbleTextColor: "#ffffff",
  assistantBubbleColor: "#f1f5f9",
  assistantBubbleTextColor: "#0f172a",
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  radius: "12px",
  shadow: "0 10px 30px rgba(15, 23, 42, 0.15)",
  dark: false,
};

export const DEFAULT_LAYOUT: WidgetLayout = {
  mode: "floating",
  position: "bottom-right",
  width: "380px",
  height: "560px",
  buttonLabel: "Chat with us",
  brandName: "Assistant",
  brandLogoUrl: null,
  showHeader: true,
};

export const DEFAULT_BEHAVIOR: WidgetBehavior = {
  welcomeMessage: "Hi! How can I help today?",
  suggestedQuestions: [],
  placeholder: "Type your message…",
  sendLabel: "Send",
  footerText: "",
  disclaimer: "",
  resetOnClose: false,
  persistAcrossSessions: true,
  newConversationLabel: "New conversation",
  dev: false,
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergePartial<T extends object>(
  defaults: T,
  ...overrides: Array<Partial<T> | undefined | null>
): T {
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const o of overrides) {
    if (!isObject(o)) continue;
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined || v === null) continue;
      out[k] = v;
    }
  }
  return out as T;
}

export interface ConfigOverrides {
  theme?: Partial<WidgetTheme>;
  layout?: Partial<WidgetLayout>;
  behavior?: Partial<WidgetBehavior>;
}

export function resolveConfig(
  ...layers: Array<ConfigOverrides | undefined | null>
): ResolvedConfig {
  const theme = mergePartial<WidgetTheme>(
    DEFAULT_THEME,
    ...layers.map((l) => l?.theme),
  );
  const layout = mergePartial<WidgetLayout>(
    DEFAULT_LAYOUT,
    ...layers.map((l) => l?.layout),
  );
  const behavior = mergePartial<WidgetBehavior>(
    DEFAULT_BEHAVIOR,
    ...layers.map((l) => l?.behavior),
  );
  return { theme, layout, behavior };
}
