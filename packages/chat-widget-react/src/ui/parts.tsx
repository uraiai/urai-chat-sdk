"use client";

import { useState, type ReactNode } from "react";
import { MessageProvider, usePresentation } from "./context";
import { cx } from "./class-names";
import {
  useAttachments,
  useChatActions,
  useChatConfig,
  useChatSelector,
  useChatStatus,
  useComposer,
  useIcons,
  useMessages,
  useStickToBottom,
  useStream,
  useThreads,
} from "./hooks";

/**
 * The compound parts. Every one is context-driven with no required
 * props, so they compose in any order and a customer can drop any of
 * them into their own shell.
 */

export function Header() {
  const { components, labels, idPrefix } = usePresentation();
  const config = useChatConfig();
  const Slot = components.Header;
  return (
    <Slot
      title={labels.brandName}
      logoUrl={config.layout.brandLogoUrl}
      logo={
        config.layout.brandLogoUrl ? (
          <img className="urai-brand-logo" src={config.layout.brandLogoUrl} alt="" />
        ) : null
      }
      threadTrigger={<ThreadTrigger />}
      titleId={`${idPrefix}-title`}
    />
  );
}

export function ThreadTrigger() {
  const { labels } = usePresentation();
  const Icon = useIcons().chevron;
  const [open, setOpen] = useState(false);
  const threads = useThreads();
  return (
    <>
      <button
        type="button"
        className="urai-thread-trigger urai-focusable"
        data-urai-part="thread-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labels.openThreadSwitcher}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) threads.refresh();
        }}
      >
        <Icon />
      </button>
      {open && <ThreadSwitcher onClose={() => setOpen(false)} />}
    </>
  );
}

export function ThreadSwitcher({ onClose }: { onClose?: () => void }) {
  const { components, labels } = usePresentation();
  const threads = useThreads();
  const SearchIcon = useIcons().search;
  const PlusIcon = useIcons().plus;
  const Slot = components.ThreadSwitcher;
  const Item = components.ThreadItem;

  return (
    <Slot
      searchInput={
        <div className="urai-thread-search">
          <SearchIcon />
          <input
            type="search"
            className="urai-focusable"
            placeholder={labels.searchConversations}
            aria-label={labels.searchConversations}
            value={threads.query}
            onChange={(e) => threads.setQuery(e.target.value)}
          />
        </div>
      }
      newConversationButton={
        <button
          type="button"
          className="urai-new-conversation urai-focusable"
          onClick={() => {
            threads.create();
            onClose?.();
          }}
        >
          <PlusIcon />
          <span>{labels.newConversation}</span>
        </button>
      }
      list={
        threads.results.length === 0 ? (
          <div className="urai-thread-empty">{threads.emptyMessage}</div>
        ) : (
          <div role="listbox" aria-label={labels.openThreadSwitcher}>
            {threads.groups.map((group) => (
              <div key={group.label} role="group" aria-label={group.label}>
                <div className="urai-thread-group-label">{group.label}</div>
                {group.threads.map((t) => (
                  <Item
                    key={t.id}
                    thread={t}
                    isActive={t.id === threads.activeThreadId}
                    title={t.title || labels.untitledThread}
                    preview={t.last_message_preview}
                    relativeTime={threads.formatRelativeTime(
                      t.last_message_at ?? t.updated_at,
                    )}
                    itemProps={{
                      type: "button",
                      role: "option",
                      "aria-selected": t.id === threads.activeThreadId,
                      onClick: () => {
                        threads.select(t.id);
                        onClose?.();
                      },
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )
      }
    />
  );
}

export function Markdown({ text, isComplete, toolSummaries }: {
  text: string;
  isComplete?: boolean;
  toolSummaries?: Record<string, string>;
}) {
  const { components } = usePresentation();
  const Slot = components.Markdown;
  return (
    <Slot text={text} isComplete={isComplete ?? true} toolSummaries={toolSummaries} />
  );
}

export function Message({ id, isLast = false }: { id: string; isLast?: boolean }) {
  const { components } = usePresentation();
  const message = useChatSelector((s) => s.messages.find((m) => m.id === id));
  if (!message) return null;

  const Attachments = components.AttachmentList;
  const attachments =
    message.attachments.length > 0 ? <Attachments message={message} /> : null;

  if (message.role === "user") {
    const Slot = components.UserMessage;
    return (
      <MessageProvider id={id}>
        <Slot message={message} isLast={isLast} content={message.content} attachments={attachments} />
      </MessageProvider>
    );
  }
  if (message.role === "error") {
    const Slot = components.ErrorMessage;
    return <Slot message={message} isLast={isLast} content={message.content} attachments={null} />;
  }

  const Slot = components.AssistantMessage;
  return (
    <MessageProvider id={id}>
      <Slot
        message={message}
        isLast={isLast}
        content={
          <Markdown
            text={message.content}
            isComplete
            toolSummaries={message.toolSummaries}
          />
        }
        attachments={attachments}
      />
    </MessageProvider>
  );
}

/**
 * Subscribes to `messages` only. Because the store keeps that array's
 * identity across every streamed token, this does not re-render mid-turn.
 */
export function MessageList() {
  const { classNames, labels, unstyled } = usePresentation();
  const messages = useMessages();
  return (
    <ol
      className={cx(unstyled ? undefined : "urai-message-list", classNames.messageList)}
      data-urai-part="message-list"
      role="log"
      aria-live="off"
      aria-relevant="additions"
      aria-label={labels.conversation}
      tabIndex={0}
    >
      {messages.map((m, i) => (
        <Message key={m.id} id={m.id} isLast={i === messages.length - 1} />
      ))}
      <StreamingMessage />
    </ol>
  );
}

/** The only part that re-renders per token. */
export function StreamingMessage() {
  const { components, labels } = usePresentation();
  const stream = useStream();
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const { idPrefix } = usePresentation();

  if (!stream) return null;
  if (!stream.attached) {
    const Thinking = components.ThinkingIndicator;
    return <Thinking label={labels.thinking} />;
  }

  const Slot = components.StreamingMessage;
  const Reasoning = components.Reasoning;
  const ToolActivity = components.ToolActivity;
  const bodyId = `${idPrefix}-reasoning`;
  const expanded = stream.reasoning?.sealed ? reasoningOpen : true;

  return (
    <Slot
      stream={stream}
      content={<Markdown text={stream.content} isComplete={false} />}
      reasoning={
        stream.reasoning ? (
          <Reasoning
            text={stream.reasoning.text}
            sealed={stream.reasoning.sealed}
            isExpanded={expanded}
            onToggle={() => setReasoningOpen((v) => !v)}
            label={labels.thoughts}
            triggerProps={{
              type: "button",
              "aria-expanded": expanded,
              "aria-controls": bodyId,
              onClick: () => setReasoningOpen((v) => !v),
            }}
            contentProps={{ id: bodyId, hidden: !expanded }}
          />
        ) : null
      }
      toolActivity={
        stream.tool ? (
          <ToolActivity label={stream.tool.label} completed={stream.tool.completed} />
        ) : null
      }
    />
  );
}

export function EmptyState() {
  const { components, labels } = usePresentation();
  const config = useChatConfig();
  const actions = useChatActions();
  const { isEmpty } = useChatStatus();
  if (!isEmpty) return null;

  const Slot = components.EmptyState;
  const Suggestions = components.SuggestedQuestions;
  const questions = config.behavior.suggestedQuestions ?? [];

  return (
    <Slot
      welcomeMessage={labels.welcomeMessage}
      suggestions={
        questions.length > 0 ? (
          <Suggestions
            questions={questions}
            onPick={(q) => void actions.send(q)}
          />
        ) : null
      }
    />
  );
}

export function Viewport({ children, className }: {
  children: ReactNode;
  className?: string;
}) {
  const { classNames, components, labels, unstyled } = usePresentation();
  const { scrollRef, contentRef, isPinned, scrollToBottom } = useStickToBottom();
  const ScrollButton = components.ScrollToBottomButton;
  return (
    <div className="urai-viewport-wrap">
      <div
        ref={scrollRef as never}
        className={cx(
          unstyled ? undefined : "urai-viewport",
          classNames.viewport,
          className,
        )}
        data-urai-part="viewport"
      >
        <div ref={contentRef as never}>{children}</div>
      </div>
      {!isPinned && (
        <ScrollButton
          label={labels.scrollToLatest}
          onClick={() => scrollToBottom({ behavior: "smooth" })}
        />
      )}
    </div>
  );
}

export function Composer() {
  const { components } = usePresentation();
  const composer = useComposer();
  const attachments = useAttachments();
  const { labels } = usePresentation();

  const Slot = components.Composer;
  const Input = components.ComposerInput;
  const Send = components.SendButton;
  const Attach = components.AttachButton;
  const Pending = components.PendingAttachment;

  return (
    <Slot
      formProps={composer.getFormProps()}
      canSend={composer.canSubmit}
      isStreaming={composer.isStreaming}
      input={<Input {...composer.getInputProps()} />}
      sendButton={
        <Send
          label={composer.sendLabel}
          disabled={!composer.canSubmit}
          isStreaming={composer.isStreaming}
          buttonProps={composer.getSendButtonProps()}
        />
      }
      attachButton={
        attachments.supported ? (
          <Attach label={labels.attachFiles} buttonProps={attachments.getTriggerProps()} />
        ) : null
      }
      fileInput={attachments.supported ? <input {...attachments.getInputProps()} /> : null}
      pendingAttachments={
        attachments.items.length > 0 ? (
          <ul className="urai-pending-list" data-urai-part="pending-attachment-list">
            {attachments.items.map((a) => (
              <Pending
                key={a.localId}
                attachment={a}
                displayName={
                  a.status === "uploading"
                    ? labels.attachmentUploading(a.fileName)
                    : a.status === "error"
                      ? labels.attachmentFailed(a.fileName)
                      : a.fileName
                }
                onRemove={() => attachments.remove(a.localId)}
                removeButtonProps={{
                  type: "button",
                  "aria-label": labels.removeAttachment(a.fileName),
                  onClick: () => attachments.remove(a.localId),
                }}
              />
            ))}
          </ul>
        ) : null
      }
    />
  );
}

export function Footer() {
  const { components, labels } = usePresentation();
  const Slot = components.Footer;
  // Disclaimer wins over footer text, matching the imperative widget.
  return <Slot text={labels.disclaimer || labels.footerText} />;
}

/**
 * A visually-hidden announcer. Deliberately separate from the message
 * log: a polite live region over streaming markdown re-announces on
 * every flush and is unusable, so the log itself is `aria-live="off"`.
 */
export function LiveRegion() {
  const { labels } = usePresentation();
  const status = useChatSelector((s) => s.status);
  return (
    <div className="urai-sr-only" role="status" aria-live="polite">
      {status === "streaming" ? labels.assistantResponding : ""}
    </div>
  );
}
