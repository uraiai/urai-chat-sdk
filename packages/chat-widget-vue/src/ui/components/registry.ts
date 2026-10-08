import type {
  ButtonHTMLAttributes,
  Component,
  FormHTMLAttributes,
  HTMLAttributes,
  TextareaHTMLAttributes,
  VNode,
} from "vue";
import type {
  ChatMessage,
  MessageComponent,
  MessageDelegate,
  PendingAttachment,
  StreamSlice,
  ThreadSummary,
  UraiChatClassNames,
  WorkspaceFile,
} from "@uraiai/chat-widget-core/headless";

/**
 * The slot map — the same slot names and prop shapes as the React view.
 *
 * Two conventions run through every signature:
 *
 *  - **Props objects** (`buttonProps`, `itemProps`, `formProps`, …) carry
 *    the ARIA attributes and listeners, in Vue's `onClick` form, so a
 *    replacement that binds them (`v-bind="buttonProps"`) stays accessible
 *    for free.
 *  - **Composite slots receive their children pre-rendered as `VNode`s**
 *    (`content`, `input`, `sendButton`, …), so restyling a wrapper never
 *    means reimplementing markdown or the message list. Render one with
 *    `<component :is="content" />` in a template, or put it straight into
 *    an `h()` children array. Absent children are `null`.
 *
 * Every default is exported, so wrapping is a one-liner:
 *
 *   Header: (p) => h("div", { class: "…" }, [h(DefaultHeader, p)])
 *
 * That works because each default takes exactly its slot props and reads
 * everything else from composables — passing `p` through is sufficient.
 */

/** A pre-rendered child, or nothing. */
export type SlotNode = VNode | null;

export interface HeaderSlotProps {
  title: string;
  logoUrl: string | null;
  logo: SlotNode;
  threadTrigger: SlotNode;
  /**
   * "Download all files" as a zip, pre-rendered by the `ArchiveButton`
   * slot. `null` until the conversation has shown a file.
   */
  archiveButton: SlotNode;
  titleId: string;
}

export interface ArchiveButtonSlotProps {
  label: string;
  isDownloading: boolean;
  buttonProps: ButtonHTMLAttributes;
}

export interface MessageSlotProps {
  message: ChatMessage;
  isLast: boolean;
  content: SlotNode;
  attachments: SlotNode;
  /** Workspace files the turn produced, pre-rendered by the `FileList` slot. */
  files: SlotNode;
  /**
   * Components tools asked the turn to display, pre-rendered by the
   * `ComponentList` slot. Only ever set on assistant messages.
   */
  displayComponents: SlotNode;
  /**
   * Sub-agent cards for the turn's `delegate` calls, pre-rendered by the
   * `DelegateList` slot. Only ever set on assistant messages.
   */
  delegates?: SlotNode;
}

export interface StreamingMessageSlotProps {
  stream: StreamSlice;
  content: SlotNode;
  reasoning: SlotNode;
  toolActivity: SlotNode;
  /** Files the turn has produced so far, pre-rendered by `FileList`. */
  files: SlotNode;
  /** Components the turn has asked for so far, pre-rendered by `ComponentList`. */
  displayComponents: SlotNode;
  /** Sub-agent cards the turn has started so far, pre-rendered by `DelegateList`. */
  delegates?: SlotNode;
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
  triggerProps: ButtonHTMLAttributes;
  contentProps: HTMLAttributes;
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
   * arguments and output stay on the authenticated channel the widget does
   * not subscribe to, so there is deliberately no body to show.
   */
  summary?: string;
  classNames: UraiChatClassNames;
  unstyled: boolean;
}

export interface ThinkingIndicatorSlotProps {
  label: string;
}

export interface ScrollToBottomButtonSlotProps {
  label: string;
  onClick(): void;
}

export interface EmptyStateSlotProps {
  welcomeMessage: string;
  suggestions: SlotNode;
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
  formProps: FormHTMLAttributes;
  input: SlotNode;
  sendButton: SlotNode;
  attachButton: SlotNode;
  fileInput: SlotNode;
  pendingAttachments: SlotNode;
  canSend: boolean;
  isStreaming: boolean;
}

/** The `<textarea>` attributes and listeners from `useComposer().getInputProps()`. */
export type ComposerInputSlotProps = TextareaHTMLAttributes & { value: string };

export interface SendButtonSlotProps {
  label: string;
  disabled: boolean;
  isStreaming: boolean;
  buttonProps: ButtonHTMLAttributes;
}

export interface AttachButtonSlotProps {
  label: string;
  buttonProps: ButtonHTMLAttributes;
}

export interface PendingAttachmentSlotProps {
  attachment: PendingAttachment;
  displayName: string;
  onRemove(): void;
  removeButtonProps: ButtonHTMLAttributes;
}

export interface AttachmentListSlotProps {
  message: ChatMessage;
}

/**
 * Files the assistant wrote to the thread's workspace — charts, CSVs,
 * reports. Never empty when rendered. Fetch bytes with
 * `useChatActions().fetchFileBlob(path)`; there is no URL to use.
 *
 * A file can be rewritten at the same size mid-turn, so key anything cached
 * per file (a fetched blob, a `key`) by `path` plus `fileVersion(file)` from
 * `@uraiai/chat-widget-core/headless`, never by `bytes`.
 */
export interface FileListSlotProps {
  files: WorkspaceFile[];
}

/**
 * Components a tool asked a turn to display. Never empty when rendered.
 * Render each through `DisplayComponent` — `DefaultComponentList` does.
 */
export interface ComponentListSlotProps {
  components: MessageComponent[];
}

/**
 * Sub-agent cards: one per `delegate` call the turn made, in call order.
 * Never empty when rendered.
 */
export interface DelegateListSlotProps {
  delegates: MessageDelegate[];
}

/**
 * What a registered display component receives as props. A uraiJS tool
 * asks for it with `meta.urai.sendCommand(thread_id, { command:
 * "displayComponent", component, props })`.
 *
 * The tool's props arrive as **one** `props` object, never spread, so a
 * tool cannot set `key`, `ref`, `class`, `style` or a listener. Declare the
 * three props (`displayComponentPropsOptions` does it for you) so they do
 * not fall through to your root element as attributes.
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
 * Component name → Vue component, passed as `displayComponents` on
 * `<ChatRoot>` / `<UraiChat>`. A name with no entry is not shown.
 */
export type UraiChatDisplayComponents = Record<string, Component>;

export interface ThreadItemSlotProps {
  thread: ThreadSummary;
  isActive: boolean;
  title: string;
  preview: string | null;
  relativeTime: string;
  itemProps: ButtonHTMLAttributes;
}

export interface ThreadSwitcherSlotProps {
  searchInput: SlotNode;
  newConversationButton: SlotNode;
  list: SlotNode;
}

export interface FooterSlotProps {
  text: string;
}

export interface FallbackSlotProps {
  /** From `layout.width`/`height`, so the box is reserved before mount. */
  width: string;
  height: string;
}

/**
 * A component used for a slot. The type parameter documents the props it
 * receives; Vue's component types are too loose to enforce it, so any
 * component is accepted.
 */
export type SlotComponent<P = Record<string, unknown>> = Component<P> | Component;

export interface UraiChatComponents {
  Header: SlotComponent<HeaderSlotProps>;
  ArchiveButton: SlotComponent<ArchiveButtonSlotProps>;
  UserMessage: SlotComponent<MessageSlotProps>;
  AssistantMessage: SlotComponent<MessageSlotProps>;
  ErrorMessage: SlotComponent<MessageSlotProps>;
  StreamingMessage: SlotComponent<StreamingMessageSlotProps>;
  Markdown: SlotComponent<MarkdownSlotProps>;
  Reasoning: SlotComponent<ReasoningSlotProps>;
  ToolActivity: SlotComponent<ToolActivitySlotProps>;
  ToolCallCard: SlotComponent<ToolCallCardSlotProps>;
  ThinkingIndicator: SlotComponent<ThinkingIndicatorSlotProps>;
  ScrollToBottomButton: SlotComponent<ScrollToBottomButtonSlotProps>;
  EmptyState: SlotComponent<EmptyStateSlotProps>;
  SuggestedQuestions: SlotComponent<SuggestedQuestionsSlotProps>;
  AttachmentList: SlotComponent<AttachmentListSlotProps>;
  FileList: SlotComponent<FileListSlotProps>;
  ComponentList: SlotComponent<ComponentListSlotProps>;
  DelegateList: SlotComponent<DelegateListSlotProps>;
  Composer: SlotComponent<ComposerSlotProps>;
  ComposerInput: SlotComponent<ComposerInputSlotProps>;
  SendButton: SlotComponent<SendButtonSlotProps>;
  AttachButton: SlotComponent<AttachButtonSlotProps>;
  PendingAttachment: SlotComponent<PendingAttachmentSlotProps>;
  ThreadSwitcher: SlotComponent<ThreadSwitcherSlotProps>;
  ThreadItem: SlotComponent<ThreadItemSlotProps>;
  Footer: SlotComponent<FooterSlotProps>;
  Fallback: SlotComponent<FallbackSlotProps>;
}

/** Every slot name, for the named-scoped-slot bridge on `<ChatRoot>`. */
export const SLOT_NAMES: ReadonlyArray<keyof UraiChatComponents> = [
  "Header",
  "ArchiveButton",
  "UserMessage",
  "AssistantMessage",
  "ErrorMessage",
  "StreamingMessage",
  "Markdown",
  "Reasoning",
  "ToolActivity",
  "ToolCallCard",
  "ThinkingIndicator",
  "ScrollToBottomButton",
  "EmptyState",
  "SuggestedQuestions",
  "AttachmentList",
  "FileList",
  "ComponentList",
  "DelegateList",
  "Composer",
  "ComposerInput",
  "SendButton",
  "AttachButton",
  "PendingAttachment",
  "ThreadSwitcher",
  "ThreadItem",
  "Footer",
  "Fallback",
];
