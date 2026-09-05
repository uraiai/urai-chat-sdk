"use client";


import { usePresentation } from "../context";
import { cx, resolveClass } from "../class-names";
import { useIcons } from "../hooks";
import { Markdown } from "../markdown";
import { AttachmentPreview } from "./attachments";
import type {
  AttachButtonSlotProps,
  AttachmentListSlotProps,
  ComposerSlotProps,
  EmptyStateSlotProps,
  FallbackSlotProps,
  FooterSlotProps,
  HeaderSlotProps,
  MarkdownSlotProps,
  MessageSlotProps,
  PendingAttachmentSlotProps,
  ReasoningSlotProps,
  SendButtonSlotProps,
  StreamingMessageSlotProps,
  SuggestedQuestionsSlotProps,
  ThinkingIndicatorSlotProps,
  ThreadItemSlotProps,
  ThreadSwitcherSlotProps,
  ToolActivitySlotProps,
  ToolCallCardSlotProps,
  UraiChatComponents,
} from "./registry";

/**
 * The shipped defaults.
 *
 * Each one takes exactly its slot props and reads everything else from
 * hooks, which is the invariant that makes `{...props}` spreading always
 * sufficient when a customer wraps rather than replaces.
 */

/** Class helper: default class first, caller's appended, never replaced. */
function useCls() {
  const { classNames, unstyled } = usePresentation();
  return (
    part: keyof typeof classNames,
    base: string,
    state?: Record<string, unknown>,
  ) =>
    cx(
      unstyled ? undefined : base,
      resolveClass(classNames[part] as never, state as never),
    );
}

export function DefaultHeader(props: HeaderSlotProps) {
  const cls = useCls();
  return (
    <header className={cls("header", "urai-header")} data-urai-part="header">
      {props.logo}
      <span className={cls("title", "urai-title")} id={props.titleId}>
        {props.title}
      </span>
      {props.threadTrigger}
    </header>
  );
}

export function DefaultMarkdown(props: MarkdownSlotProps) {
  return (
    <Markdown
      text={props.text}
      isComplete={props.isComplete}
      toolSummaries={props.toolSummaries}
    />
  );
}

export function DefaultUserMessage(props: MessageSlotProps) {
  const cls = useCls();
  const { labels } = usePresentation();
  return (
    <li
      className={cx(
        cls("message", "urai-message", { role: "user", isLast: props.isLast }),
        cls("userMessage", "urai-message-user"),
      )}
      data-urai-part="user-message"
    >
      <span className="urai-sr-only">{labels.messageRolePrefix("user")}</span>
      <div className="urai-bubble">{props.message.content}</div>
      {props.attachments}
    </li>
  );
}

export function DefaultAssistantMessage(props: MessageSlotProps) {
  const cls = useCls();
  const { labels } = usePresentation();
  return (
    <li
      className={cx(
        cls("message", "urai-message", {
          role: "assistant",
          isLast: props.isLast,
        }),
        cls("assistantMessage", "urai-message-assistant"),
      )}
      data-urai-part="assistant-message"
    >
      <span className="urai-sr-only">{labels.messageRolePrefix("assistant")}</span>
      <div className="urai-bubble">{props.content}</div>
      {props.attachments}
    </li>
  );
}

export function DefaultErrorMessage(props: MessageSlotProps) {
  const cls = useCls();
  return (
    <li
      className={cls("errorMessage", "urai-message-error")}
      data-urai-part="error-message"
      role="alert"
    >
      {props.message.content}
    </li>
  );
}

export function DefaultStreamingMessage(props: StreamingMessageSlotProps) {
  const cls = useCls();
  return (
    <li
      className={cx(
        cls("message", "urai-message", { role: "assistant", isLast: true }),
        cls("assistantMessage", "urai-message-assistant"),
      )}
      data-urai-part="assistant-message"
      data-state="streaming"
      aria-busy="true"
    >
      {props.reasoning}
      {props.toolActivity}
      <div className="urai-bubble">{props.content}</div>
    </li>
  );
}

export function DefaultReasoning(props: ReasoningSlotProps) {
  const cls = useCls();
  const Icon = useIcons().chevron;
  return (
    <div
      className={cls("reasoning", "urai-reasoning", {
        isExpanded: props.isExpanded,
      })}
      data-urai-part="reasoning"
      data-expanded={props.isExpanded}
    >
      <button
        {...props.triggerProps}
        className={cx(
          cls("reasoningTrigger", "urai-reasoning-trigger"),
          "urai-focusable",
        )}
      >
        <Icon className="urai-reasoning-chevron" />
        <span>{props.label}</span>
      </button>
      <div
        {...props.contentProps}
        className={cls("reasoningBody", "urai-reasoning-body")}
      >
        {props.text}
      </div>
    </div>
  );
}

export function DefaultToolActivity(props: ToolActivitySlotProps) {
  const cls = useCls();
  return (
    <div
      className={cls("toolActivity", "urai-tool-activity")}
      data-urai-part="tool-activity"
      role="status"
      aria-live="polite"
    >
      <span className="urai-tool-activity-dot" aria-hidden="true" />
      <span>{props.completed ? props.label : `${props.label}…`}</span>
    </div>
  );
}

export function DefaultToolCallCard(props: ToolCallCardSlotProps) {
  const { labels } = usePresentation();
  const label = props.summary ?? labels.toolWorking;
  return (
    <div
      className={cx(
        props.unstyled ? undefined : "urai-tool-summary",
        props.summary ? undefined : "urai-tool-summary-pending",
      )}
      data-urai-part="tool-call-card"
      data-state={props.summary ? "complete" : "pending"}
    >
      {label}
    </div>
  );
}

export function DefaultThinkingIndicator(props: ThinkingIndicatorSlotProps) {
  const cls = useCls();
  return (
    <div
      className={cls("thinkingIndicator", "urai-thinking")}
      data-urai-part="thinking"
      role="status"
    >
      <span className="urai-thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>{props.label}</span>
    </div>
  );
}

export function DefaultScrollToBottomButton(props: {
  label: string;
  onClick(): void;
}) {
  const cls = useCls();
  const Icon = useIcons().scrollDown;
  return (
    <button
      type="button"
      className={cx(
        cls("scrollToBottomButton", "urai-scroll-to-bottom"),
        "urai-focusable",
      )}
      data-urai-part="scroll-to-bottom"
      aria-label={props.label}
      onClick={props.onClick}
    >
      <Icon />
    </button>
  );
}

export function DefaultEmptyState(props: EmptyStateSlotProps) {
  const cls = useCls();
  if (!props.welcomeMessage && !props.suggestions) return null;
  return (
    <div className={cls("emptyState", "urai-empty")} data-urai-part="empty-state">
      {props.welcomeMessage && (
        <div className="urai-bubble urai-message-assistant">
          {props.welcomeMessage}
        </div>
      )}
      {props.suggestions}
    </div>
  );
}

export function DefaultSuggestedQuestions(props: SuggestedQuestionsSlotProps) {
  const cls = useCls();
  if (props.questions.length === 0) return null;
  return (
    <div
      className={cls("suggestedQuestions", "urai-suggested")}
      data-urai-part="suggested-questions"
    >
      {props.questions.map((q) => (
        <button
          key={q}
          type="button"
          className={cx(
            cls("suggestedQuestion", "urai-suggested-question"),
            "urai-focusable",
          )}
          onClick={() => props.onPick(q)}
        >
          {q}
        </button>
      ))}
    </div>
  );
}

export function DefaultAttachmentList(props: AttachmentListSlotProps) {
  const cls = useCls();
  if (props.message.attachments.length === 0) return null;
  return (
    <div
      className={cls("attachmentList", "urai-attachments")}
      data-urai-part="attachment-list"
    >
      {props.message.attachments.map((a, i) => (
        <AttachmentPreview key={i} attachment={a} />
      ))}
    </div>
  );
}

export function DefaultComposer(props: ComposerSlotProps) {
  const cls = useCls();
  const { labels, idPrefix } = usePresentation();
  return (
    <form
      {...props.formProps}
      className={cls("composer", "urai-composer")}
      data-urai-part="composer"
    >
      {props.pendingAttachments}
      <div className="urai-composer-row">
        {props.attachButton}
        {props.input}
        {props.sendButton}
      </div>
      {props.fileInput}
      <span id={`${idPrefix}-composer-hint`} className="urai-sr-only">
        {labels.composerHint}
      </span>
    </form>
  );
}

export function DefaultComposerInput(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const cls = useCls();
  return (
    <textarea
      {...props}
      className={cx(cls("composerInput", "urai-composer-input"), "urai-focusable")}
      data-urai-part="composer-input"
    />
  );
}

export function DefaultSendButton(props: SendButtonSlotProps) {
  const cls = useCls();
  const Icon = useIcons().send;
  return (
    <button
      {...props.buttonProps}
      className={cx(cls("sendButton", "urai-send"), "urai-focusable")}
      data-urai-part="send-button"
    >
      <Icon />
    </button>
  );
}

export function DefaultAttachButton(props: AttachButtonSlotProps) {
  const cls = useCls();
  const Icon = useIcons().paperclip;
  return (
    <button
      {...props.buttonProps}
      className={cx(cls("attachButton", "urai-attach"), "urai-focusable")}
      data-urai-part="attach-button"
    >
      <Icon />
    </button>
  );
}

export function DefaultPendingAttachment(props: PendingAttachmentSlotProps) {
  const cls = useCls();
  const Icon = useIcons().remove;
  return (
    <li
      className={cls("pendingAttachment", "urai-pending-chip", {
        status: props.attachment.status,
      })}
      data-urai-part="pending-attachment"
      data-state={props.attachment.status}
      title={props.attachment.errorMessage ?? props.attachment.fileName}
    >
      <span className="urai-pending-chip-name">{props.displayName}</span>
      <button
        {...props.removeButtonProps}
        className="urai-pending-chip-remove urai-focusable"
      >
        <Icon />
      </button>
    </li>
  );
}

export function DefaultThreadSwitcher(props: ThreadSwitcherSlotProps) {
  const cls = useCls();
  return (
    <div
      className={cls("threadSwitcher", "urai-thread-switcher")}
      data-urai-part="thread-switcher"
    >
      <div className="urai-thread-switcher-head">
        {props.searchInput}
        {props.newConversationButton}
      </div>
      {props.list}
    </div>
  );
}

export function DefaultThreadItem(props: ThreadItemSlotProps) {
  const cls = useCls();
  return (
    <button
      {...props.itemProps}
      className={cx(
        cls("threadItem", "urai-thread-item", { isActive: props.isActive }),
        "urai-focusable",
      )}
      data-urai-part="thread-item"
      data-state={props.isActive ? "active" : undefined}
    >
      <span className="urai-thread-title">{props.title}</span>
      {props.preview && (
        <span className="urai-thread-preview">{props.preview}</span>
      )}
      <span className="urai-thread-meta">{props.relativeTime}</span>
    </button>
  );
}

export function DefaultFooter(props: FooterSlotProps) {
  const cls = useCls();
  if (!props.text) return null;
  return (
    <div className={cls("footer", "urai-footer")} data-urai-part="footer">
      {props.text}
    </div>
  );
}

/**
 * Shown until the client mounts. Sized from the configured layout so the
 * box is reserved and nothing shifts when the real tree arrives.
 */
export function DefaultFallback(props: FallbackSlotProps) {
  return (
    <div
      className="urai-fallback"
      data-urai-part="fallback"
      aria-hidden="true"
      style={{ width: props.width, height: props.height }}
    />
  );
}

export const defaultComponents: UraiChatComponents = {
  Header: DefaultHeader,
  UserMessage: DefaultUserMessage,
  AssistantMessage: DefaultAssistantMessage,
  ErrorMessage: DefaultErrorMessage,
  StreamingMessage: DefaultStreamingMessage,
  Markdown: DefaultMarkdown,
  Reasoning: DefaultReasoning,
  ToolActivity: DefaultToolActivity,
  ToolCallCard: DefaultToolCallCard,
  ThinkingIndicator: DefaultThinkingIndicator,
  ScrollToBottomButton: DefaultScrollToBottomButton,
  EmptyState: DefaultEmptyState,
  SuggestedQuestions: DefaultSuggestedQuestions,
  AttachmentList: DefaultAttachmentList,
  Composer: DefaultComposer,
  ComposerInput: DefaultComposerInput,
  SendButton: DefaultSendButton,
  AttachButton: DefaultAttachButton,
  PendingAttachment: DefaultPendingAttachment,
  ThreadSwitcher: DefaultThreadSwitcher,
  ThreadItem: DefaultThreadItem,
  Footer: DefaultFooter,
  Fallback: DefaultFallback,
};

