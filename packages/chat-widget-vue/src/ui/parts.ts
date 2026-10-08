import { createTextVNode, defineComponent, Fragment, h, ref, type PropType } from "vue";
import { cx, threadPreview } from "@uraiai/chat-widget-core/headless";
import { provideMessageId, usePresentation, useChatSelector } from "./context";
import {
  useAttachments,
  useChatActions,
  useChatConfig,
  useChatStatus,
  useComposer,
  useMessages,
  useStickToBottom,
  useStream,
  useThread,
  useThreadArchive,
  useThreads,
} from "./composables";

/**
 * The compound parts. Every one is injection-driven with no required props,
 * so they compose in any order and a customer can drop any of them into
 * their own shell, inside `<ChatRoot>`.
 */

export const ThreadSwitcher = defineComponent({
  name: "ChatThreadSwitcher",
  props: {
    /** Called after a thread is picked or a new conversation started. */
    onClose: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props) {
    const p = usePresentation();
    const threads = useThreads();
    return () => {
      const labels = p.labels;
      const icons = p.icons;
      const Item = p.components.ThreadItem;
      return h(p.components.ThreadSwitcher, {
        searchInput: h("div", { class: "urai-thread-search" }, [
          h(icons.search),
          h("input", {
            type: "search",
            class: "urai-focusable",
            placeholder: labels.searchConversations,
            "aria-label": labels.searchConversations,
            value: threads.query,
            onInput: (e: Event) => threads.setQuery((e.target as HTMLInputElement).value),
          }),
        ]),
        newConversationButton: h(
          "button",
          {
            type: "button",
            class: "urai-new-conversation urai-focusable",
            onClick: () => {
              threads.create();
              props.onClose?.();
            },
          },
          [h(icons.plus), h("span", labels.newConversation)],
        ),
        list:
          threads.results.length === 0
            ? h("div", { class: "urai-thread-empty" }, threads.emptyMessage)
            : h(
                "div",
                { role: "listbox", "aria-label": labels.openThreadSwitcher },
                threads.groups.map((group) =>
                  h("div", { key: group.label, role: "group", "aria-label": group.label }, [
                    h("div", { class: "urai-thread-group-label" }, group.label),
                    ...group.threads.map((t) =>
                      h(Item, {
                        key: t.id,
                        thread: t,
                        isActive: t.id === threads.activeThreadId,
                        title: t.title || labels.untitledThread,
                        preview: threadPreview(t.last_message_preview),
                        relativeTime: threads.formatRelativeTime(
                          t.last_message_at ?? t.updated_at,
                        ),
                        itemProps: {
                          type: "button",
                          role: "option",
                          "aria-selected": t.id === threads.activeThreadId,
                          onClick: () => {
                            threads.select(t.id);
                            props.onClose?.();
                          },
                        },
                      }),
                    ),
                  ]),
                ),
              ),
      });
    };
  },
});

export const ThreadTrigger = defineComponent({
  name: "ChatThreadTrigger",
  setup() {
    const p = usePresentation();
    const open = ref(false);
    const threads = useThreads();
    const thread = useThread();
    return () => {
      // The switcher navigates away from the thread the host asked to show.
      if (thread.value.readOnly) return null;
      return h(Fragment, [
        h(
          "button",
          {
            type: "button",
            class: "urai-thread-trigger urai-focusable",
            "data-urai-part": "thread-trigger",
            "aria-haspopup": "dialog",
            "aria-expanded": open.value,
            "aria-label": p.labels.openThreadSwitcher,
            onClick: () => {
              open.value = !open.value;
              if (open.value) threads.refresh();
            },
          },
          [h(p.icons.chevron)],
        ),
        open.value ? h(ThreadSwitcher, { onClose: () => (open.value = false) }) : null,
      ]);
    };
  },
});

/** "Download all files" — renders nothing until the conversation has a file. */
export const ArchiveButton = defineComponent({
  name: "ChatArchiveButton",
  setup() {
    const p = usePresentation();
    const archive = useThreadArchive();
    return () => {
      if (!archive.available) return null;
      return h(p.components.ArchiveButton, {
        label: archive.isDownloading ? p.labels.downloadingFiles : p.labels.downloadAllFiles,
        isDownloading: archive.isDownloading,
        buttonProps: archive.buttonProps,
      });
    };
  },
});

export const Header = defineComponent({
  name: "ChatHeader",
  setup() {
    const p = usePresentation();
    const config = useChatConfig();
    const thread = useThread();
    return () => {
      const logoUrl = config.value.layout.brandLogoUrl ?? null;
      return h(p.components.Header, {
        // A read-only view is about one conversation, so it names it.
        title: (thread.value.readOnly && thread.value.summary?.title) || p.labels.brandName,
        logoUrl,
        logo: logoUrl ? h("img", { class: "urai-brand-logo", src: logoUrl, alt: "" }) : null,
        threadTrigger: h(ThreadTrigger),
        archiveButton: h(ArchiveButton),
        titleId: `${p.idPrefix}-title`,
      });
    };
  },
});

export const Markdown = defineComponent({
  name: "ChatMarkdown",
  props: {
    text: { type: String, required: true },
    isComplete: { type: Boolean, default: true },
    toolSummaries: { type: Object as PropType<Record<string, string>>, default: undefined },
  },
  setup(props) {
    const p = usePresentation();
    return () =>
      h(p.components.Markdown, {
        text: props.text,
        isComplete: props.isComplete,
        toolSummaries: props.toolSummaries,
      });
  },
});

/**
 * One settled message. Subscribes to its own row only, so it does not
 * re-render while another turn streams.
 */
export const Message = defineComponent({
  name: "ChatMessage",
  props: {
    id: { type: String, required: true },
    isLast: { type: Boolean, default: false },
  },
  setup(props) {
    const p = usePresentation();
    provideMessageId(() => props.id);
    const message = useChatSelector((s) => s.messages.find((m) => m.id === props.id));
    return () => {
      const m = message.value;
      if (!m) return null;
      const c = p.components;
      const attachments =
        m.attachments.length > 0 ? h(c.AttachmentList, { message: m }) : null;

      if (m.role === "user") {
        return h(c.UserMessage, {
          message: m,
          isLast: props.isLast,
          content: createTextVNode(m.content),
          attachments,
          files: null,
          displayComponents: null,
        });
      }
      if (m.role === "error") {
        return h(c.ErrorMessage, {
          message: m,
          isLast: props.isLast,
          content: createTextVNode(m.content),
          attachments: null,
          files: null,
          displayComponents: null,
        });
      }
      return h(c.AssistantMessage, {
        message: m,
        isLast: props.isLast,
        content: h(Markdown, {
          text: m.content,
          isComplete: true,
          toolSummaries: m.toolSummaries,
        }),
        attachments,
        files: m.files?.length ? h(c.FileList, { files: m.files }) : null,
        displayComponents: m.components?.length
          ? h(c.ComponentList, { components: m.components })
          : null,
        delegates: m.delegates?.length ? h(c.DelegateList, { delegates: m.delegates }) : null,
      });
    };
  },
});

/** The only part that re-renders per token. */
export const StreamingMessage = defineComponent({
  name: "ChatStreamingMessage",
  setup() {
    const p = usePresentation();
    const stream = useStream();
    const reasoningOpen = ref(false);
    const toggle = () => {
      reasoningOpen.value = !reasoningOpen.value;
    };
    return () => {
      const s = stream.value;
      if (!s) return null;
      const c = p.components;
      const labels = p.labels;
      if (!s.attached) return h(c.ThinkingIndicator, { label: labels.thinking });

      const bodyId = `${p.idPrefix}-reasoning`;
      const expanded = s.reasoning?.sealed ? reasoningOpen.value : true;
      return h(c.StreamingMessage, {
        stream: s,
        content: h(Markdown, { text: s.content, isComplete: false }),
        reasoning: s.reasoning
          ? h(c.Reasoning, {
              text: s.reasoning.text,
              sealed: s.reasoning.sealed,
              isExpanded: expanded,
              onToggle: toggle,
              label: labels.thoughts,
              triggerProps: {
                type: "button",
                "aria-expanded": expanded,
                "aria-controls": bodyId,
                onClick: toggle,
              },
              contentProps: { id: bodyId, hidden: !expanded },
            })
          : null,
        toolActivity: s.tool
          ? h(c.ToolActivity, { label: s.tool.label, completed: s.tool.completed })
          : null,
        files: s.files.length > 0 ? h(c.FileList, { files: s.files }) : null,
        displayComponents:
          s.components.length > 0 ? h(c.ComponentList, { components: s.components }) : null,
        delegates: s.delegates.length > 0 ? h(c.DelegateList, { delegates: s.delegates }) : null,
      });
    };
  },
});

/**
 * Subscribes to `messages` only. Because the store keeps that array's
 * identity across every streamed token, this does not re-render mid-turn.
 */
export const MessageList = defineComponent({
  name: "ChatMessageList",
  setup() {
    const p = usePresentation();
    const messages = useMessages();
    return () => {
      const list = messages.value;
      return h(
        "ol",
        {
          class: cx(p.unstyled ? undefined : "urai-message-list", p.classNames.messageList),
          "data-urai-part": "message-list",
          role: "log",
          "aria-live": "off",
          "aria-relevant": "additions",
          "aria-label": p.labels.conversation,
          tabindex: 0,
        },
        [
          ...list.map((m, i) =>
            h(Message, { key: m.id, id: m.id, isLast: i === list.length - 1 }),
          ),
          h(StreamingMessage),
        ],
      );
    };
  },
});

export const EmptyState = defineComponent({
  name: "ChatEmptyState",
  setup() {
    const p = usePresentation();
    const config = useChatConfig();
    const actions = useChatActions();
    const status = useChatStatus();
    const thread = useThread();
    return () => {
      if (!status.value.isEmpty) return null;
      const c = p.components;
      const labels = p.labels;
      const load = thread.value.load;
      const notice =
        load === "loading"
          ? labels.loadingConversation
          : load === "not-found"
            ? labels.conversationUnavailable
            : load === "failed"
              ? labels.conversationLoadFailed
              : null;
      // A welcome and starter questions invite a message a read-only view
      // cannot send.
      if (notice || thread.value.readOnly) {
        return h(c.EmptyState, { welcomeMessage: "", suggestions: null, notice });
      }
      const questions = config.value.behavior.suggestedQuestions ?? [];
      return h(c.EmptyState, {
        welcomeMessage: labels.welcomeMessage,
        suggestions:
          questions.length > 0
            ? h(c.SuggestedQuestions, {
                questions,
                onPick: (q: string) => void actions.send(q),
              })
            : null,
      });
    };
  },
});

/**
 * The scrolling transcript area. Its default slot is the content; a `class`
 * lands on the scrolling element.
 */
export const Viewport = defineComponent({
  name: "ChatViewport",
  inheritAttrs: false,
  setup(_props, { slots, attrs }) {
    const p = usePresentation();
    const { scrollRef, contentRef, isPinned, scrollToBottom } = useStickToBottom();
    return () =>
      h("div", { class: "urai-viewport-wrap" }, [
        h(
          "div",
          {
            ...attrs,
            ref: scrollRef,
            class: [
              cx(p.unstyled ? undefined : "urai-viewport", p.classNames.viewport),
              attrs.class,
            ],
            "data-urai-part": "viewport",
          },
          [h("div", { ref: contentRef }, slots.default?.())],
        ),
        isPinned.value
          ? null
          : h(p.components.ScrollToBottomButton, {
              label: p.labels.scrollToLatest,
              onClick: () => scrollToBottom({ behavior: "smooth" }),
            }),
      ]);
  },
});

export const Composer = defineComponent({
  name: "ChatComposer",
  setup() {
    const p = usePresentation();
    const composer = useComposer();
    const attachments = useAttachments();
    const thread = useThread();
    return () => {
      if (thread.value.readOnly) return null;
      const c = p.components;
      const labels = p.labels;
      const items = attachments.items;
      return h(c.Composer, {
        formProps: composer.getFormProps(),
        canSend: composer.canSubmit,
        isStreaming: composer.isStreaming,
        input: h(c.ComposerInput, composer.getInputProps()),
        sendButton: h(c.SendButton, {
          label: composer.sendLabel,
          disabled: !composer.canSubmit,
          isStreaming: composer.isStreaming,
          buttonProps: composer.getSendButtonProps(),
        }),
        attachButton: attachments.supported
          ? h(c.AttachButton, {
              label: labels.attachFiles,
              buttonProps: attachments.getTriggerProps(),
            })
          : null,
        fileInput: attachments.supported ? h("input", attachments.getInputProps()) : null,
        pendingAttachments:
          items.length > 0
            ? h(
                "ul",
                { class: "urai-pending-list", "data-urai-part": "pending-attachment-list" },
                items.map((a) =>
                  h(c.PendingAttachment, {
                    key: a.localId,
                    attachment: a,
                    displayName:
                      a.status === "uploading"
                        ? labels.attachmentUploading(a.fileName)
                        : a.status === "error"
                          ? labels.attachmentFailed(a.fileName)
                          : a.fileName,
                    onRemove: () => attachments.remove(a.localId),
                    removeButtonProps: {
                      type: "button",
                      "aria-label": labels.removeAttachment(a.fileName),
                      onClick: () => attachments.remove(a.localId),
                    },
                  }),
                ),
              )
            : null,
      });
    };
  },
});

export const Footer = defineComponent({
  name: "ChatFooter",
  setup() {
    const p = usePresentation();
    // Disclaimer wins over footer text, matching the imperative widget.
    return () =>
      h(p.components.Footer, { text: p.labels.disclaimer || p.labels.footerText });
  },
});

/**
 * A visually-hidden announcer. Deliberately separate from the message log: a
 * polite live region over streaming markdown re-announces on every flush and
 * is unusable, so the log itself is `aria-live="off"`.
 */
export const LiveRegion = defineComponent({
  name: "ChatLiveRegion",
  setup() {
    const p = usePresentation();
    const status = useChatSelector((s) => s.status);
    return () =>
      h(
        "div",
        { class: "urai-sr-only", role: "status", "aria-live": "polite" },
        status.value === "streaming" ? p.labels.assistantResponding : "",
      );
  },
});
