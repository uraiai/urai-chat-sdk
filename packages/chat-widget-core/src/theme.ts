import type { WidgetTheme } from "./config";

const VAR_PREFIX = "--ucw";

function setVar(host: HTMLElement, name: string, value: string) {
  host.style.setProperty(`${VAR_PREFIX}-${name}`, value);
}

export function applyTheme(host: HTMLElement, theme: WidgetTheme) {
  setVar(host, "primary", theme.primaryColor);
  setVar(host, "primary-text", theme.primaryTextColor);
  setVar(host, "background", theme.backgroundColor);
  setVar(host, "surface", theme.surfaceColor);
  setVar(host, "text", theme.textColor);
  setVar(host, "muted", theme.mutedColor);
  setVar(host, "border", theme.borderColor);
  setVar(host, "user-bg", theme.userBubbleColor);
  setVar(host, "user-text", theme.userBubbleTextColor);
  setVar(host, "asst-bg", theme.assistantBubbleColor);
  setVar(host, "asst-text", theme.assistantBubbleTextColor);
  setVar(host, "font", theme.fontFamily);
  setVar(host, "radius", theme.radius);
  setVar(host, "shadow", theme.shadow);

  const dark =
    theme.dark === true ||
    (theme.dark === "system" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  host.dataset.theme = dark ? "dark" : "light";
}
