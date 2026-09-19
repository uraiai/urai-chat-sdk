"use client";

import type { ComponentType, ReactNode } from "react";
import type {
  ChatMessage,
  MessageComponent,
  PendingAttachment,
  StreamSlice,
  ThreadSummary,
  WorkspaceFile,
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
  /**
   * "Download all files" as a zip, pre-rendered by the `ArchiveButton`
   * slot. `null` until the conversation has shown a file.
   */
  archiveButton: ReactNode | null;
  titleId: string;
}

export interface ArchiveButtonSlotProps {
  label: string;
  isDownloading: boolean;
  buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
}

export interface MessageSlotProps {
  message: ChatMessage;
  isLast: boolean;
  content: ReactNode;
  attachments: ReactNode | null;
  /** Workspace files the turn produced, pre-rendered by the `FileList` slot. */
  files: ReactNode | null;
  /**
   * Components tools asked the turn to display, pre-rendered by the
   * `ComponentList` slot. Only ever set on assistant messages.
   */
  displayComponents: ReactNode | null;
}

export interface StreamingMessageSlotProps {
  stream: StreamSlice;
  content: ReactNode;
  reasoning: ReactNode | null;
  toolActivity: ReactNode | null;
  /** Files the turn has produced so far, pre-rendered by `FileList`. */
  files: ReactNode | null;
  /** Components the turn has asked for so far, pre-rendered by `ComponentList`. */
  displayComponents: ReactNode | null;
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
  /**
   * Set instead of the welcome message while a host-requested thread loads
   * or when it could not be opened ("This conversation is unavailable").
   */
  notice?: string | null;
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

/**
 * Files the assistant wrote to the thread's workspace — charts, CSVs,
 * reports. Never empty when rendered. Fetch bytes with
 * `useChatActions().fetchFileBlob(path)`; there is no URL to use.
 *
 * A file can be rewritten at the same size mid-turn, so key anything
 * cached per file (a fetched blob, a React `key`) by `path` plus
 * `fileVersion(file)` from `@uraiai/chat-widget-core/headless`, never by
 * `bytes`.
 */
export interface FileListSlotProps {
  files: WorkspaceFile[];
}

/**
 * Components a tool asked a turn to display. Never empty when rendered.
 * Render each through `DisplayComponent`-style lookup against the
 * `displayComponents` prop on `<Chat.Root>` — `DefaultComponentList` does.
 */
export interface ComponentListSlotProps {
  components: MessageComponent[];
}

/**
 * What a registered display component receives. A uraiJS tool asks for it
 * with `meta.urai.sendCommand(thread_id, { command: "displayComponent",
 * component, props })`.
 */
export interface DisplayComponentProps<
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * The tool's `props`, verbatim. It is tool output: the type parameter is
   * a claim, not a check, so validate before trusting it.
   */
  props: P;
  /** The name the tool asked for. */
  component: string;
  /** Send a message as the visitor, e.g. from a button in the component. */
  sendMessage(text: string): void;
}

/**
 * Component name → component, passed as `displayComponents` on
 * `<Chat.Root>` / `<UraiChat>`. A name with no entry is not shown.
 */
export type UraiChatDisplayComponents = Record<
  string,
  // `any` so a component typed for its own props (`DisplayComponentProps<
  // { orderId: string }>`) is assignable; parameters are contravariant.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ComponentType<DisplayComponentProps<any>>
>;

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
  ArchiveButton: ComponentType<ArchiveButtonSlotProps>;
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
  FileList: ComponentType<FileListSlotProps>;
  ComponentList: ComponentType<ComponentListSlotProps>;
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
