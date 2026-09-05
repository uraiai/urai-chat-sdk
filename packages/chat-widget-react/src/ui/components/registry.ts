"use client";

import type { ComponentType, ReactNode } from "react";
import type {
  ChatMessage,
  PendingAttachment,
  StreamSlice,
  ThreadSummary,
} from "@uraiai/chat-widget-core/headless";
import type { UraiChatClassNames } from "../class-names";

/**
 * The slot map.
 *
 * Two conventions run through every signature:
 *
 *  - **Props getters** carry the ARIA attributes and handlers, so a
 *    replacement that spreads them stays accessible for free.
 *  - **Composite slots receive their children pre-rendered** as
 *    `ReactNode`, so restyling a wrapper never means reimplementing
 *    markdown or the message list.
 *
 * Every default is exported, so wrapping is a one-liner:
 *
 *   Header: (p) => <div className="…"><DefaultHeader {...p} /></div>
 *
 * That works because each default takes exactly its slot props and
 * reads everything else from hooks — `{...props}` is always sufficient.
 */

export interface HeaderSlotProps {
  title: string;
  logoUrl: string | null;
  logo: ReactNode | null;
  threadTrigger: ReactNode;
  titleId: string;
}

export interface MessageSlotProps {
  message: ChatMessage;
  isLast: boolean;
  content: ReactNode;
  attachments: ReactNode | null;
}

export interface StreamingMessageSlotProps {
  stream: StreamSlice;
  content: ReactNode;
  reasoning: ReactNode | null;
  toolActivity: ReactNode | null;
}

export interface MarkdownSlotProps {
  /** Raw markdown — swap in your own renderer here. */
  text: string;
  isComplete: boolean;
  toolSummaries?: Record<string, string>;
}

export interface ReasoningSlotProps {
  text: string;
  sealed: boolean;
  isExpanded: boolean;
  onToggle(): void;
  label: string;
  triggerProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
  contentProps: React.HTMLAttributes<HTMLDivElement>;
}

export interface ToolActivitySlotProps {
  label: string;
  completed: boolean;
}

export interface ToolCallCardSlotProps {
  id?: string;
  /**
   * The server-generated label, when one has arrived. The widget's SSE
   * channel carries only `{id, fn_name}`, `{id, ok}` and `{id, summary}` —
   * arguments and output stay on the authenticated channel the widget
   * does not subscribe to, so there is deliberately no body to show.
   */
  summary?: string;
  classNames: UraiChatClassNames;
  unstyled: boolean;
}

export interface ThinkingIndicatorSlotProps {
  label: string;
}

export interface EmptyStateSlotProps {
  welcomeMessage: string;
  suggestions: ReactNode | null;
}

export interface SuggestedQuestionsSlotProps {
  questions: string[];
  onPick(question: string): void;
}

export interface ComposerSlotProps {
  formProps: React.FormHTMLAttributes<HTMLFormElement>;
  input: ReactNode;
  sendButton: ReactNode;
  attachButton: ReactNode | null;
  fileInput: ReactNode | null;
  pendingAttachments: ReactNode | null;
  canSend: boolean;
  isStreaming: boolean;
}

export interface SendButtonSlotProps {
  label: string;
  disabled: boolean;
  isStreaming: boolean;
  buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export interface AttachButtonSlotProps {
  label: string;
  buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export interface PendingAttachmentSlotProps {
  attachment: PendingAttachment;
  displayName: string;
  onRemove(): void;
  removeButtonProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export interface AttachmentListSlotProps {
  message: ChatMessage;
}

export interface ThreadItemSlotProps {
  thread: ThreadSummary;
  isActive: boolean;
  title: string;
  preview: string | null;
  relativeTime: string;
  itemProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export interface ThreadSwitcherSlotProps {
  searchInput: ReactNode;
  newConversationButton: ReactNode;
  list: ReactNode;
}

export interface FooterSlotProps {
  text: string;
}

export interface FallbackSlotProps {
  /** From `layout.width`/`height`, so the box is reserved before mount. */
  width: string;
  height: string;
}

export interface UraiChatComponents {
  Header: ComponentType<HeaderSlotProps>;
  UserMessage: ComponentType<MessageSlotProps>;
  AssistantMessage: ComponentType<MessageSlotProps>;
  ErrorMessage: ComponentType<MessageSlotProps>;
  StreamingMessage: ComponentType<StreamingMessageSlotProps>;
  Markdown: ComponentType<MarkdownSlotProps>;
  Reasoning: ComponentType<ReasoningSlotProps>;
  ToolActivity: ComponentType<ToolActivitySlotProps>;
  ToolCallCard: ComponentType<ToolCallCardSlotProps>;
  ThinkingIndicator: ComponentType<ThinkingIndicatorSlotProps>;
  ScrollToBottomButton: ComponentType<{
    label: string;
    onClick(): void;
  }>;
  EmptyState: ComponentType<EmptyStateSlotProps>;
  SuggestedQuestions: ComponentType<SuggestedQuestionsSlotProps>;
  AttachmentList: ComponentType<AttachmentListSlotProps>;
  Composer: ComponentType<ComposerSlotProps>;
  ComposerInput: ComponentType<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>
  >;
  SendButton: ComponentType<SendButtonSlotProps>;
  AttachButton: ComponentType<AttachButtonSlotProps>;
  PendingAttachment: ComponentType<PendingAttachmentSlotProps>;
  ThreadSwitcher: ComponentType<ThreadSwitcherSlotProps>;
  ThreadItem: ComponentType<ThreadItemSlotProps>;
  Footer: ComponentType<FooterSlotProps>;
  Fallback: ComponentType<FallbackSlotProps>;
}
