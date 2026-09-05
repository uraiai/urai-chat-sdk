"use client";

import type { ResolvedConfig } from "@uraiai/chat-widget-core";
import type { MessageRole } from "@uraiai/chat-widget-core/headless";

/**
 * Every user-visible string in one bag.
 *
 * Resolution order, lowest to highest:
 *
 *   DEFAULT_LABELS  <  server behavior/layout strings  <  labels prop
 *
 * which matches how `theme` and `layout` already layer. A `labels` prop
 * is a deliberate developer override, so it wins over the dashboard.
 */
export interface UraiChatLabels {
  brandName: string;
  conversation: string;
  openThreadSwitcher: string;

  searchConversations: string;
  newConversation: string;
  loadingThreads: string;
  noMatches: string;
  noThreads: string;
  untitledThread: string;

  welcomeMessage: string;
  thinking: string;
  thoughts: string;
  scrollToLatest: string;
  stop: string;
  toolWorking: string;

  placeholder: string;
  send: string;
  composerHint: string;
  attachFiles: string;
  removeAttachment(fileName: string): string;
  attachmentUploading(fileName: string): string;
  attachmentFailed(fileName: string): string;
  attachmentUploadFailed: string;
  downloadAttachment(fileName: string): string;

  footerText: string;
  disclaimer: string;

  messageRolePrefix(role: MessageRole): string;
  assistantResponding: string;

  /** Extra `fn_name` → label entries, merged over the built-in map. */
  toolNames: Record<string, string>;
  relativeTime(iso: string, now?: Date): string;
}

export type UraiChatLabelsInput = Partial<UraiChatLabels>;

/**
 * `Intl.RelativeTimeFormat` rather than the eight hand-rolled suffixes
 * the imperative widget carries, which also removes the flat-30-day-month
 * quirk that made "1y ago" start at 360 days.
 */
function defaultRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = then - now.getTime();
  if (diff > 0) return "just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const seconds = Math.round(diff / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return rtf.format(Math.round(seconds / size), unit);
    }
  }
  return rtf.format(seconds, "second");
}

export const DEFAULT_LABELS: UraiChatLabels = {
  brandName: "Assistant",
  conversation: "Conversation",
  openThreadSwitcher: "Open conversations",

  searchConversations: "Search conversations",
  newConversation: "New conversation",
  loadingThreads: "Loading…",
  noMatches: "No matches",
  noThreads: "No previous conversations yet",
  untitledThread: "Untitled",

  welcomeMessage: "",
  thinking: "Thinking",
  thoughts: "Thoughts",
  scrollToLatest: "Scroll to latest",
  stop: "Stop",
  toolWorking: "Working",

  placeholder: "Type your message…",
  send: "Send",
  composerHint: "Press Enter to send, Shift+Enter for a new line",
  attachFiles: "Attach files",
  removeAttachment: (f) => `Remove ${f}`,
  attachmentUploading: (f) => `${f}…`,
  attachmentFailed: (f) => `${f} — failed`,
  attachmentUploadFailed: "Attachment upload failed",
  downloadAttachment: (f) => `Download ${f}`,

  footerText: "",
  disclaimer: "",

  messageRolePrefix: (role) =>
    role === "user" ? "You said:" : role === "error" ? "Error:" : "Assistant said:",
  assistantResponding: "Assistant is responding",

  toolNames: {},
  relativeTime: defaultRelativeTime,
};

/**
 * A blank dashboard field must not wipe the English default, so an
 * empty string counts as unset for these six. `mergePartial` only skips
 * null and undefined, which is a latent bug for exactly these fields.
 */
function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

export function resolveLabels(
  config: ResolvedConfig,
  overrides?: UraiChatLabelsInput,
): UraiChatLabels {
  const fromServer: UraiChatLabelsInput = {
    brandName: nonEmpty(config.layout.brandName),
    placeholder: nonEmpty(config.behavior.placeholder),
    send: nonEmpty(config.behavior.sendLabel),
    welcomeMessage: nonEmpty(config.behavior.welcomeMessage),
    newConversation: nonEmpty(config.behavior.newConversationLabel),
    footerText: nonEmpty(config.behavior.footerText),
    disclaimer: nonEmpty(config.behavior.disclaimer),
  };

  const merged: UraiChatLabels = { ...DEFAULT_LABELS };
  for (const layer of [fromServer, overrides]) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined || value === null) continue;
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }
  // Merged, not replaced, so a caller adding one tool name keeps the rest.
  merged.toolNames = { ...DEFAULT_LABELS.toolNames, ...overrides?.toolNames };
  return merged;
}
