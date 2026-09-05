"use client";

/**
 * Per-part class overrides.
 *
 * Composition is **append, never replace**: the default class is the
 * hook our stylesheet targets, so swapping it out would silently
 * unstyle the part. `unstyled` drops all defaults in one go for a
 * from-scratch Tailwind build.
 *
 * Every part also emits `data-urai-part`, and stateful ones emit
 * `data-state` — that attribute, not the class, is the documented
 * styling contract, so internal class names can change without breaking
 * anyone.
 */
export type ClassValue = string | undefined | null | false;
export type StatefulClass<S> = ClassValue | ((state: S) => ClassValue);

export interface UraiChatClassNames {
  root?: ClassValue;
  header?: ClassValue;
  brandLogo?: ClassValue;
  title?: ClassValue;
  threadTrigger?: StatefulClass<{ isOpen: boolean }>;
  threadSwitcher?: ClassValue;
  threadSearchInput?: ClassValue;
  newConversationButton?: ClassValue;
  threadGroupLabel?: ClassValue;
  threadItem?: StatefulClass<{ isActive: boolean }>;
  threadListEmpty?: ClassValue;
  viewport?: ClassValue;
  messageList?: ClassValue;
  message?: StatefulClass<{ role: string; isLast: boolean }>;
  userMessage?: ClassValue;
  assistantMessage?: ClassValue;
  errorMessage?: ClassValue;
  markdown?: ClassValue;
  reasoning?: StatefulClass<{ isExpanded: boolean }>;
  reasoningTrigger?: ClassValue;
  reasoningBody?: ClassValue;
  toolActivity?: ClassValue;
  thinkingIndicator?: ClassValue;
  scrollToBottomButton?: ClassValue;
  emptyState?: ClassValue;
  suggestedQuestions?: ClassValue;
  suggestedQuestion?: ClassValue;
  attachmentList?: ClassValue;
  imageAttachment?: ClassValue;
  fileAttachment?: ClassValue;
  composer?: ClassValue;
  composerInput?: ClassValue;
  sendButton?: ClassValue;
  stopButton?: ClassValue;
  attachButton?: ClassValue;
  pendingAttachmentList?: ClassValue;
  pendingAttachment?: StatefulClass<{ status: string }>;
  footer?: ClassValue;
}

/** Tiny `clsx`. Not worth a dependency for eight lines. */
export function cx(...values: ClassValue[]): string | undefined {
  const out = values.filter(Boolean).join(" ");
  return out.length > 0 ? out : undefined;
}

export function resolveClass<S>(
  value: StatefulClass<S> | undefined,
  state: S,
): ClassValue {
  return typeof value === "function" ? value(state) : value;
}
