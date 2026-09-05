"use client";

import { tokensCss } from "@uraiai/chat-widget-core/theme";

/**
 * Light DOM means a real stylesheet, and the failure mode that costs the
 * most support time is a customer who never imports it and sees a
 * completely unstyled chat. So the CSS is auto-injected by default and a
 * computed-style probe makes that mutually exclusive with importing
 * `@uraiai/chat-widget-react/styles.css` yourself.
 *
 * Component rules are emitted as `.urai-root :where(.urai-x)` — one
 * class of specificity. That clears a host's bare `button {}` or `p {}`
 * reset (0,0,1), which would otherwise repaint our own controls, while
 * still tying with a single host class or Tailwind utility. The
 * stylesheet is prepended to `<head>`, so on that tie the host's rule
 * wins on source order — `bg-blue-500` on a slot still works with no
 * `!important`.
 *
 * `@layer` was considered and rejected: layer order is fixed by first
 * declaration, which depends on an import order we do not control.
 *
 * The one deliberate exception is the focus ring, which out-specifies a
 * host `button:focus-visible { outline: none }` — otherwise embedding
 * the widget silently strips keyboard affordance.
 */
const w = (sel: string) =>
  sel.startsWith(".urai-root")
    ? `:where(${sel})`
    : // Scoped under `.urai-root`, so the rule sits at (0,1,0). At
      // (0,0,0) a host's bare `button { background: … }` reset — which
      // almost every app has — beat our own button styling and rendered
      // the icons white on white. (0,1,0) clears element selectors while
      // still tying with a single class; because the stylesheet is
      // prepended to <head>, an equal-specificity host rule or Tailwind
      // utility still wins on source order.
      `.urai-root :where(${sel})`;

export const componentCss = `
${w(".urai-root")} {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  font-family: var(--urai-font-family);
  font-size: var(--urai-font-size-md);
  line-height: var(--urai-line-height-normal);
  color: var(--urai-color-text);
  background: var(--urai-color-surface);
  border-radius: var(--urai-radius);
  overflow: hidden;
}
${w(".urai-root *")} { box-sizing: border-box; }

.urai-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* The one place we deliberately out-specify the host: a global
   button:focus-visible { outline: none } would otherwise strip the
   keyboard affordance from an embedded widget. */
.urai-root .urai-focusable:focus-visible {
  outline: var(--urai-focus-ring-width) solid var(--urai-color-focus-ring);
  outline-offset: var(--urai-focus-ring-offset);
  border-radius: inherit;
}

${w(".urai-header")} {
  display: flex; align-items: center; gap: var(--urai-space-5);
  padding: var(--urai-space-6) var(--urai-space-7);
  background: var(--urai-color-primary);
  color: var(--urai-color-on-primary);
  flex: 0 0 auto;
  --urai-color-focus-ring: var(--urai-color-on-primary);
}
${w(".urai-title")} { font-weight: 600; flex: 1; }
${w(".urai-brand-logo")} { width: var(--urai-space-11); height: var(--urai-space-11); border-radius: var(--urai-radius-xs); }
${w(".urai-thread-trigger")} {
  background: none; border: 0; color: inherit; cursor: pointer;
  padding: var(--urai-space-2); border-radius: var(--urai-radius-xs);
  display: inline-flex;
}
${w(".urai-thread-trigger:hover")} { background: var(--urai-color-hover-on-primary); }
${w(".urai-thread-trigger svg")} { width: 16px; height: 16px; }

${w(".urai-viewport-wrap")} { position: relative; flex: 1; min-height: 0; display: flex; }
${w(".urai-viewport")} { flex: 1; min-height: 0; overflow-y: auto; padding: var(--urai-space-6); }
${w(".urai-message-list")} { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--urai-space-6); }

${w(".urai-message")} { display: flex; flex-direction: column; max-width: 98%; }
${w(".urai-message-user")} { align-self: flex-end; align-items: flex-end; }
${w(".urai-message-assistant")} { align-self: flex-start; }
${w(".urai-bubble")} {
  padding: var(--urai-space-6) var(--urai-space-7);
  border-radius: var(--urai-radius);
  overflow-wrap: anywhere;
}
${w(".urai-message-user .urai-bubble")} {
  background: var(--urai-color-bubble-user-bg);
  color: var(--urai-color-bubble-user-text);
}
${w(".urai-message-assistant .urai-bubble")} {
  background: var(--urai-color-bubble-assistant-bg);
  color: var(--urai-color-bubble-assistant-text);
}
${w(".urai-message-error")} {
  align-self: stretch; font-size: var(--urai-font-size-sm);
  color: var(--urai-color-danger); background: var(--urai-color-danger-bg);
  border-radius: var(--urai-radius-sm); padding: var(--urai-space-5) var(--urai-space-6);
}

/* Markdown inside a bubble. Tuned for an embedded width, not a page:
   browser defaults indent lists 40px, which is 17% of a 380px panel. */
${w(".urai-markdown > :first-child")} { margin-top: 0; }
${w(".urai-markdown > :last-child")} { margin-bottom: 0; }
${w(".urai-markdown p")} { margin: var(--urai-space-4) 0; }
${w(".urai-markdown ul, .urai-markdown ol")} { margin: var(--urai-space-4) 0; padding-left: var(--urai-space-9); }
${w(".urai-markdown li")} { margin: var(--urai-space-1) 0; }
${w(".urai-markdown h1, .urai-markdown h2, .urai-markdown h3, .urai-markdown h4, .urai-markdown h5, .urai-markdown h6")} {
  margin: var(--urai-space-6) 0 var(--urai-space-3);
  font-size: 1em; font-weight: 600; line-height: var(--urai-line-height-tight);
}
${w(".urai-markdown a")} { color: var(--urai-color-accent); }
${w(".urai-markdown code")} { font-family: var(--urai-font-family-mono); }
${w(".urai-markdown pre")} {
  background: var(--urai-color-surface-sunken);
  padding: var(--urai-space-5); border-radius: var(--urai-radius-sm);
  overflow-x: auto; max-width: 100%; margin: var(--urai-space-4) 0;
  font-size: var(--urai-font-size-xs); line-height: var(--urai-line-height-snug);
}
${w(".urai-markdown img")} { max-width: 100%; height: auto; border-radius: var(--urai-radius-sm); }
${w(".urai-markdown table")} { display: block; width: 100%; overflow-x: auto; border-collapse: collapse; font-size: var(--urai-font-size-sm); }
${w(".urai-markdown th, .urai-markdown td")} { border: 1px solid var(--urai-color-border); padding: var(--urai-space-2) var(--urai-space-4); }
${w(".urai-markdown blockquote")} {
  margin: var(--urai-space-4) 0; padding-left: var(--urai-space-6);
  border-left: 2px solid var(--urai-color-border); color: var(--urai-color-text-muted);
}

${w(".urai-reasoning")} {
  border: 1px solid var(--urai-color-border); border-radius: var(--urai-radius-sm);
  margin-bottom: var(--urai-space-4); font-size: var(--urai-font-size-xs);
  color: var(--urai-color-text-muted);
}
${w(".urai-reasoning-trigger")} {
  display: flex; align-items: center; gap: var(--urai-space-3); width: 100%;
  background: none; border: 0; color: inherit; cursor: pointer;
  padding: var(--urai-space-3) var(--urai-space-5); font-size: inherit;
}
${w(".urai-reasoning-chevron")} { width: 10px; height: 10px; transition: transform var(--urai-duration-normal); }
${w('.urai-reasoning[data-expanded="true"] .urai-reasoning-chevron')} { transform: rotate(90deg); }
${w(".urai-reasoning-body")} {
  padding: 0 var(--urai-space-5) var(--urai-space-4); white-space: pre-wrap;
  line-height: var(--urai-line-height-snug);
}

${w(".urai-tool-activity")} {
  display: flex; align-items: center; gap: var(--urai-space-5);
  font-size: var(--urai-font-size-xs); color: var(--urai-color-text-muted);
  margin-bottom: var(--urai-space-3);
}
${w(".urai-tool-activity-dot")} {
  width: 6px; height: 6px; border-radius: var(--urai-radius-full);
  background: var(--urai-color-accent); flex: 0 0 auto;
  animation: var(--urai-animation-tool-pulse);
}
${w(".urai-tool-summary")} {
  display: flex; align-items: center; gap: var(--urai-space-5);
  margin: var(--urai-space-3) 0; padding: var(--urai-space-3) var(--urai-space-5);
  font-size: var(--urai-font-size-xs); color: var(--urai-color-text-muted);
  background: var(--urai-color-surface-raised);
  border: 1px solid var(--urai-color-border);
  border-radius: var(--urai-radius-sm); font-style: italic;
}
${w(".urai-tool-summary::before")} {
  content: ""; width: 6px; height: 6px; border-radius: var(--urai-radius-full);
  background: var(--urai-color-accent); flex: 0 0 auto;
}
${w(".urai-tool-summary-pending")} { opacity: 0.7; }

${w(".urai-thinking")} {
  display: flex; align-items: center; gap: var(--urai-space-5);
  font-size: var(--urai-font-size-xs); color: var(--urai-color-text-muted);
  padding: var(--urai-space-3) 0;
}
${w(".urai-thinking-dots")} { display: inline-flex; gap: var(--urai-space-2); }
${w(".urai-thinking-dots span")} {
  width: 5px; height: 5px; border-radius: var(--urai-radius-full);
  background: currentColor; animation: var(--urai-animation-thinking-pulse);
}
${w(".urai-thinking-dots span:nth-child(2)")} { animation-delay: var(--urai-stagger-thinking); }
${w(".urai-thinking-dots span:nth-child(3)")} { animation-delay: calc(var(--urai-stagger-thinking) * 2); }

@keyframes urai-tool-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50%      { opacity: 1;   transform: scale(1); }
}
@keyframes urai-thinking-pulse {
  0%, 100% { opacity: 0.3; }
  50%      { opacity: 1; }
}

${w(".urai-empty")} { display: flex; flex-direction: column; gap: var(--urai-space-6); }
${w(".urai-suggested")} { display: flex; flex-wrap: wrap; gap: var(--urai-space-4); }
${w(".urai-suggested-question")} {
  background: var(--urai-color-surface-raised); color: var(--urai-color-text);
  border: 1px solid var(--urai-color-border); border-radius: var(--urai-radius-full);
  padding: var(--urai-space-3) var(--urai-space-6); cursor: pointer;
  font-size: var(--urai-font-size-xs); font-family: inherit;
}
${w(".urai-suggested-question:hover")} { background: var(--urai-color-hover-on-surface); }

${w(".urai-composer")} {
  display: flex; flex-direction: column; gap: var(--urai-space-4);
  padding: var(--urai-space-6); border-top: 1px solid var(--urai-color-border);
  background: var(--urai-color-surface-raised); flex: 0 0 auto;
}
${w(".urai-composer-row")} { display: flex; align-items: flex-end; gap: var(--urai-space-4); }
${w(".urai-composer-input")} {
  flex: 1; resize: none; min-height: 36px; max-height: 120px;
  padding: var(--urai-space-5) var(--urai-space-6);
  border: 1px solid var(--urai-color-border); border-radius: var(--urai-radius-sm);
  font-family: inherit; font-size: var(--urai-font-size-md);
  color: var(--urai-color-text); background: var(--urai-color-surface);
}
${w(".urai-send, .urai-attach")} {
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; cursor: pointer; border-radius: var(--urai-radius-sm);
  padding: var(--urai-space-5);
}
${w(".urai-send")} { background: var(--urai-color-primary); color: var(--urai-color-on-primary); }
${w(".urai-send:hover:not(:disabled)")} { background: var(--urai-color-primary-hover); }
${w(".urai-send:disabled")} { opacity: 0.5; cursor: not-allowed; }
${w(".urai-attach")} { background: none; color: var(--urai-color-text-muted); }
${w(".urai-attach:hover")} { background: var(--urai-color-hover-on-surface); }
${w(".urai-send svg, .urai-attach svg")} { width: 18px; height: 18px; }

${w(".urai-pending-list")} { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--urai-space-3); }
${w(".urai-pending-chip")} {
  display: inline-flex; align-items: center; gap: var(--urai-space-3);
  max-width: 200px; padding: var(--urai-space-2) var(--urai-space-5);
  border: 1px solid var(--urai-color-border); border-radius: var(--urai-radius-full);
  font-size: var(--urai-font-size-xs); background: var(--urai-color-surface);
}
${w('.urai-pending-chip[data-state="uploading"]')} { opacity: 0.7; }
${w('.urai-pending-chip[data-state="error"]')} { border-color: var(--urai-color-danger); color: var(--urai-color-danger); }
${w(".urai-pending-chip-name")} { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${w(".urai-pending-chip-remove")} {
  background: none; border: 0; cursor: pointer; color: inherit;
  display: inline-flex; padding: 0;
}
${w(".urai-pending-chip-remove svg")} { width: 12px; height: 12px; }

${w(".urai-attachments")} { display: flex; flex-wrap: wrap; gap: var(--urai-space-4); margin-top: var(--urai-space-4); }
${w(".urai-attachment-image")} { max-width: 220px; max-height: 180px; border-radius: var(--urai-radius-sm); }
${w(".urai-attachment-file")} {
  display: inline-flex; align-items: center; gap: var(--urai-space-3);
  padding: var(--urai-space-3) var(--urai-space-5);
  border: 1px solid var(--urai-color-border); border-radius: var(--urai-radius-sm);
  font-size: var(--urai-font-size-xs); color: inherit; text-decoration: none;
}
${w(".urai-attachment-file svg")} { width: 14px; height: 14px; flex: 0 0 auto; }

${w(".urai-thread-switcher")} {
  position: absolute; inset: 0; z-index: 10; display: flex; flex-direction: column;
  background: var(--urai-color-surface); border-bottom: 1px solid var(--urai-color-border);
}
${w(".urai-thread-switcher-head")} { display: flex; gap: var(--urai-space-4); padding: var(--urai-space-5); }
${w(".urai-thread-search")} { display: flex; align-items: center; gap: var(--urai-space-3); flex: 1; }
${w(".urai-thread-search svg")} { width: 14px; height: 14px; color: var(--urai-color-text-muted); }
${w(".urai-thread-search input")} {
  flex: 1; border: 1px solid var(--urai-color-border); border-radius: var(--urai-radius-sm);
  padding: var(--urai-space-3) var(--urai-space-5); font-family: inherit;
  font-size: var(--urai-font-size-sm); background: var(--urai-color-surface);
  color: var(--urai-color-text);
}
${w(".urai-new-conversation")} {
  display: inline-flex; align-items: center; gap: var(--urai-space-3);
  background: none; border: 1px solid var(--urai-color-border);
  border-radius: var(--urai-radius-sm); padding: var(--urai-space-3) var(--urai-space-5);
  cursor: pointer; font-family: inherit; font-size: var(--urai-font-size-xs);
  color: var(--urai-color-text); white-space: nowrap;
}
${w(".urai-new-conversation svg")} { width: 14px; height: 14px; color: var(--urai-color-accent); }
${w(".urai-thread-group-label")} {
  font-size: var(--urai-font-size-2xs); color: var(--urai-color-text-muted);
  padding: var(--urai-space-4) var(--urai-space-5) var(--urai-space-2);
  text-transform: uppercase; letter-spacing: 0.5px;
}
${w(".urai-thread-item")} {
  display: flex; flex-direction: column; gap: var(--urai-space-1); width: 100%;
  text-align: left; background: none; border: 0; cursor: pointer;
  padding: var(--urai-space-5); font-family: inherit; color: inherit;
  border-left: 2px solid transparent;
}
${w(".urai-thread-item:hover")} { background: var(--urai-color-hover-on-surface); }
.urai-root .urai-thread-item[data-state="active"] { border-left-color: var(--urai-color-accent); }
${w(".urai-thread-title")} { font-size: var(--urai-font-size-sm); font-weight: 500; }
${w(".urai-thread-preview, .urai-thread-meta")} {
  font-size: var(--urai-font-size-2xs); color: var(--urai-color-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
${w(".urai-thread-empty")} {
  padding: var(--urai-space-10) var(--urai-space-5); text-align: center;
  font-size: var(--urai-font-size-xs); color: var(--urai-color-text-muted);
}

${w(".urai-scroll-to-bottom")} {
  position: absolute; bottom: var(--urai-space-6); left: 50%;
  transform: translateX(-50%);
  background: var(--urai-color-surface-raised); color: var(--urai-color-text);
  border: 1px solid var(--urai-color-border); border-radius: var(--urai-radius-full);
  padding: var(--urai-space-4); cursor: pointer; display: inline-flex;
  box-shadow: var(--urai-shadow-panel);
}
${w(".urai-scroll-to-bottom svg")} { width: 16px; height: 16px; }

${w(".urai-footer")} {
  padding: var(--urai-space-3) var(--urai-space-6) var(--urai-space-5);
  font-size: var(--urai-font-size-2xs); color: var(--urai-color-text-muted);
  text-align: center; background: var(--urai-color-surface-raised);
}

${w(".urai-fallback")} { display: block; }

/* Durations go to a near-zero value rather than 0: the chevron rotation
   is state, not decoration, so it must still reach its end position —
   instantly. The dots keep a static 0.7 opacity because at full opacity
   they read as "done" rather than "waiting". */
@media (prefers-reduced-motion: reduce) {
  ${w(".urai-root")} {
    --urai-animation-tool-pulse: none;
    --urai-animation-thinking-pulse: none;
    --urai-duration-fast: 0.01ms;
    --urai-duration-normal: 0.01ms;
  }
  ${w(".urai-tool-activity-dot, .urai-thinking-dots span")} { opacity: 0.7; }
}
`;

export function stylesheet(): string {
  return `${tokensCss()}\n${componentCss}`;
}

let injected = false;

/**
 * Inject the stylesheet unless it is already present. The probe reads a
 * computed custom property, so it works however the CSS arrived —
 * bundler import, `<link>`, CDN, or a previous instance.
 */
export function ensureStyles(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  if (document.querySelector("style[data-urai-chat-styles]")) return;

  const probe = document.createElement("div");
  probe.className = "urai-root";
  probe.style.display = "none";
  document.body.appendChild(probe);
  const present =
    getComputedStyle(probe).getPropertyValue("--urai-styles").trim() === "1";
  probe.remove();
  if (present) return;

  const el = document.createElement("style");
  el.setAttribute("data-urai-chat-styles", "auto");
  el.textContent = `${w(".urai-root")} { --urai-styles: 1; }\n${stylesheet()}`;
  document.head.prepend(el);
}
