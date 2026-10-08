import { h, type FunctionalComponent, type VNodeChild } from "vue";
import {
  cx,
  fileVersion,
  resolveClass,
  type UraiChatClassNames,
} from "@uraiai/chat-widget-core/headless";
import { usePresentation, type PresentationContextValue } from "../context";
import { Markdown } from "../markdown";
import { AttachmentPreview } from "./attachments";
import { WorkspaceFilePreview } from "./files";
import { DisplayComponent } from "./display-component";
import type {
  ArchiveButtonSlotProps,
  AttachButtonSlotProps,
  AttachmentListSlotProps,
  ComponentListSlotProps,
  ComposerInputSlotProps,
  ComposerSlotProps,
  DelegateListSlotProps,
  EmptyStateSlotProps,
  FallbackSlotProps,
  FileListSlotProps,
  FooterSlotProps,
  HeaderSlotProps,
  MarkdownSlotProps,
  MessageSlotProps,
  PendingAttachmentSlotProps,
  ReasoningSlotProps,
  ScrollToBottomButtonSlotProps,
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
 * Each is a functional component that takes exactly its slot props and reads
 * everything else from composables — the invariant that makes passing the
 * props straight through (`h(DefaultHeader, p)`) sufficient when a customer
 * wraps rather than replaces.
 *
 * All of them set `inheritAttrs: false`: slot props such as `onClick` or
 * `onPick` are handed over explicitly, and must not also fall through onto
 * the root element as listeners.
 */
function slot<P>(name: string, render: (props: P) => VNodeChild): FunctionalComponent<P> {
  const component = ((props: P) => render(props)) as FunctionalComponent<P>;
  component.displayName = name;
  component.inheritAttrs = false;
  return component;
}

/** Class helper: default class first, caller's appended, never replaced. */
function cls(
  p: PresentationContextValue,
  part: keyof UraiChatClassNames,
  base: string,
  state?: Record<string, unknown>,
): string | undefined {
  return cx(
    p.unstyled ? undefined : base,
    resolveClass(p.classNames[part] as never, state as never),
  );
}

export const DefaultHeader = slot<HeaderSlotProps>("DefaultHeader", (props) => {
  const p = usePresentation();
  return h("header", { class: cls(p, "header", "urai-header"), "data-urai-part": "header" }, [
    props.logo,
    h("span", { class: cls(p, "title", "urai-title"), id: props.titleId }, props.title),
    props.archiveButton,
    props.threadTrigger,
  ]);
});

export const DefaultMarkdown = slot<MarkdownSlotProps>("DefaultMarkdown", (props) =>
  h(Markdown, {
    text: props.text,
    isComplete: props.isComplete,
    toolSummaries: props.toolSummaries,
  }),
);

export const DefaultUserMessage = slot<MessageSlotProps>("DefaultUserMessage", (props) => {
  const p = usePresentation();
  return h(
    "li",
    {
      class: cx(
        cls(p, "message", "urai-message", { role: "user", isLast: props.isLast }),
        cls(p, "userMessage", "urai-message-user"),
      ),
      "data-urai-part": "user-message",
    },
    [
      h("span", { class: "urai-sr-only" }, p.labels.messageRolePrefix("user")),
      h("div", { class: "urai-bubble" }, props.message.content),
      props.attachments,
    ],
  );
});

export const DefaultAssistantMessage = slot<MessageSlotProps>(
  "DefaultAssistantMessage",
  (props) => {
    const p = usePresentation();
    return h(
      "li",
      {
        class: cx(
          cls(p, "message", "urai-message", { role: "assistant", isLast: props.isLast }),
          cls(p, "assistantMessage", "urai-message-assistant"),
        ),
        "data-urai-part": "assistant-message",
      },
      [
        h("span", { class: "urai-sr-only" }, p.labels.messageRolePrefix("assistant")),
        h("div", { class: "urai-bubble" }, [
          props.content,
          props.delegates ?? null,
          props.displayComponents,
          props.files,
        ]),
        props.attachments,
      ],
    );
  },
);

export const DefaultErrorMessage = slot<MessageSlotProps>("DefaultErrorMessage", (props) => {
  const p = usePresentation();
  return h(
    "li",
    {
      class: cls(p, "errorMessage", "urai-message-error"),
      "data-urai-part": "error-message",
      role: "alert",
    },
    props.message.content,
  );
});

export const DefaultStreamingMessage = slot<StreamingMessageSlotProps>(
  "DefaultStreamingMessage",
  (props) => {
    const p = usePresentation();
    return h(
      "li",
      {
        class: cx(
          cls(p, "message", "urai-message", { role: "assistant", isLast: true }),
          cls(p, "assistantMessage", "urai-message-assistant"),
        ),
        "data-urai-part": "assistant-message",
        "data-state": "streaming",
        "aria-busy": "true",
      },
      [
        props.reasoning,
        props.toolActivity,
        h("div", { class: "urai-bubble" }, [
          props.content,
          props.delegates ?? null,
          props.displayComponents,
          props.files,
        ]),
      ],
    );
  },
);

export const DefaultReasoning = slot<ReasoningSlotProps>("DefaultReasoning", (props) => {
  const p = usePresentation();
  return h(
    "div",
    {
      class: cls(p, "reasoning", "urai-reasoning", { isExpanded: props.isExpanded }),
      "data-urai-part": "reasoning",
      "data-expanded": String(props.isExpanded),
    },
    [
      h(
        "button",
        {
          ...props.triggerProps,
          class: cx(cls(p, "reasoningTrigger", "urai-reasoning-trigger"), "urai-focusable"),
        },
        [h(p.icons.chevron, { class: "urai-reasoning-chevron" }), h("span", props.label)],
      ),
      h(
        "div",
        { ...props.contentProps, class: cls(p, "reasoningBody", "urai-reasoning-body") },
        props.text,
      ),
    ],
  );
});

export const DefaultToolActivity = slot<ToolActivitySlotProps>(
  "DefaultToolActivity",
  (props) => {
    const p = usePresentation();
    return h(
      "div",
      {
        class: cls(p, "toolActivity", "urai-tool-activity"),
        "data-urai-part": "tool-activity",
        role: "status",
        "aria-live": "polite",
      },
      [
        h("span", { class: "urai-tool-activity-dot", "aria-hidden": "true" }),
        h("span", props.completed ? props.label : `${props.label}…`),
      ],
    );
  },
);

export const DefaultToolCallCard = slot<ToolCallCardSlotProps>(
  "DefaultToolCallCard",
  (props) => {
    const p = usePresentation();
    const label = props.summary ?? p.labels.toolWorking;
    return h(
      "div",
      {
        class: cx(
          props.unstyled ? undefined : "urai-tool-summary",
          props.summary ? undefined : "urai-tool-summary-pending",
        ),
        "data-urai-part": "tool-call-card",
        "data-state": props.summary ? "complete" : "pending",
      },
      label,
    );
  },
);

export const DefaultThinkingIndicator = slot<ThinkingIndicatorSlotProps>(
  "DefaultThinkingIndicator",
  (props) => {
    const p = usePresentation();
    return h(
      "div",
      {
        class: cls(p, "thinkingIndicator", "urai-thinking"),
        "data-urai-part": "thinking",
        role: "status",
      },
      [
        h("span", { class: "urai-thinking-dots", "aria-hidden": "true" }, [
          h("span"),
          h("span"),
          h("span"),
        ]),
        h("span", props.label),
      ],
    );
  },
);

export const DefaultScrollToBottomButton = slot<ScrollToBottomButtonSlotProps>(
  "DefaultScrollToBottomButton",
  (props) => {
    const p = usePresentation();
    return h(
      "button",
      {
        type: "button",
        class: cx(cls(p, "scrollToBottomButton", "urai-scroll-to-bottom"), "urai-focusable"),
        "data-urai-part": "scroll-to-bottom",
        "aria-label": props.label,
        onClick: () => props.onClick(),
      },
      [h(p.icons.scrollDown)],
    );
  },
);

export const DefaultEmptyState = slot<EmptyStateSlotProps>("DefaultEmptyState", (props) => {
  const p = usePresentation();
  if (props.notice) {
    return h(
      "div",
      { class: cls(p, "emptyState", "urai-empty"), "data-urai-part": "empty-state" },
      [
        h(
          "p",
          { class: "urai-empty-notice", "data-urai-part": "empty-notice", role: "status" },
          props.notice,
        ),
      ],
    );
  }
  if (!props.welcomeMessage && !props.suggestions) return null;
  return h(
    "div",
    { class: cls(p, "emptyState", "urai-empty"), "data-urai-part": "empty-state" },
    [
      props.welcomeMessage
        ? h("div", { class: "urai-bubble urai-message-assistant" }, props.welcomeMessage)
        : null,
      props.suggestions,
    ],
  );
});

export const DefaultSuggestedQuestions = slot<SuggestedQuestionsSlotProps>(
  "DefaultSuggestedQuestions",
  (props) => {
    const p = usePresentation();
    if (props.questions.length === 0) return null;
    return h(
      "div",
      {
        class: cls(p, "suggestedQuestions", "urai-suggested"),
        "data-urai-part": "suggested-questions",
      },
      props.questions.map((q) =>
        h(
          "button",
          {
            key: q,
            type: "button",
            class: cx(cls(p, "suggestedQuestion", "urai-suggested-question"), "urai-focusable"),
            onClick: () => props.onPick(q),
          },
          q,
        ),
      ),
    );
  },
);

export const DefaultAttachmentList = slot<AttachmentListSlotProps>(
  "DefaultAttachmentList",
  (props) => {
    const p = usePresentation();
    if (props.message.attachments.length === 0) return null;
    return h(
      "div",
      { class: cls(p, "attachmentList", "urai-attachments"), "data-urai-part": "attachment-list" },
      props.message.attachments.map((a, i) => h(AttachmentPreview, { key: i, attachment: a })),
    );
  },
);

export const DefaultFileList = slot<FileListSlotProps>("DefaultFileList", (props) => {
  const p = usePresentation();
  if (props.files.length === 0) return null;
  return h(
    "div",
    {
      class: cls(p, "fileList", "urai-attachments urai-files"),
      "data-urai-part": "file-list",
      role: "group",
      "aria-label": p.labels.files,
    },
    props.files.map((f) =>
      h(WorkspaceFilePreview, { key: `${f.path}@${fileVersion(f)}`, file: f }),
    ),
  );
});

export const DefaultComponentList = slot<ComponentListSlotProps>(
  "DefaultComponentList",
  (props) => {
    const p = usePresentation();
    if (props.components.length === 0) return null;
    return h(
      "div",
      { class: cls(p, "componentList", "urai-components"), "data-urai-part": "component-list" },
      // Append-only within a turn, so the index is a stable key.
      props.components.map((c, i) => h(DisplayComponent, { key: c.id ?? i, item: c })),
    );
  },
);

/**
 * Sub-agent cards: "Sub-agent", the task's first line, a status (a spinner
 * while running) and a step count once history knows it. `data-state` is
 * the card's status, for styling.
 */
export const DefaultDelegateList = slot<DelegateListSlotProps>(
  "DefaultDelegateList",
  (props) => {
    const p = usePresentation();
    const labels = p.labels;
    if (props.delegates.length === 0) return null;
    return h(
      "div",
      {
        class: cls(p, "delegateList", "urai-delegates"),
        "data-urai-part": "delegate-list",
        role: "group",
        "aria-label": labels.subAgents,
      },
      props.delegates.map((d) => {
        const steps = labels.delegateSteps(d.steps);
        return h(
          "div",
          {
            key: d.id,
            class: cls(p, "delegate", "urai-delegate", { status: d.status }),
            "data-urai-part": "delegate",
            "data-state": d.status,
            "aria-busy": d.status === "running" ? "true" : undefined,
          },
          [
            h("span", { class: "urai-delegate-icon", "aria-hidden": "true" }),
            h("div", { class: "urai-delegate-main" }, [
              h("div", { class: "urai-delegate-head" }, [
                h("span", { class: "urai-delegate-kind" }, labels.subAgent),
                h("span", { class: "urai-delegate-status" }, labels.delegateStatus(d.status)),
                steps ? h("span", { class: "urai-delegate-steps" }, steps) : null,
              ]),
              d.label
                ? h("div", { class: "urai-delegate-label", title: d.label }, d.label)
                : null,
            ]),
          ],
        );
      }),
    );
  },
);

export const DefaultComposer = slot<ComposerSlotProps>("DefaultComposer", (props) => {
  const p = usePresentation();
  return h(
    "form",
    { ...props.formProps, class: cls(p, "composer", "urai-composer"), "data-urai-part": "composer" },
    [
      props.pendingAttachments,
      h("div", { class: "urai-composer-row" }, [
        props.attachButton,
        props.input,
        props.sendButton,
      ]),
      props.fileInput,
      h("span", { id: `${p.idPrefix}-composer-hint`, class: "urai-sr-only" }, p.labels.composerHint),
    ],
  );
});

export const DefaultComposerInput = slot<ComposerInputSlotProps>(
  "DefaultComposerInput",
  (props) => {
    const p = usePresentation();
    return h("textarea", {
      ...props,
      class: cx(cls(p, "composerInput", "urai-composer-input"), "urai-focusable"),
      "data-urai-part": "composer-input",
    });
  },
);

export const DefaultSendButton = slot<SendButtonSlotProps>("DefaultSendButton", (props) => {
  const p = usePresentation();
  return h(
    "button",
    {
      ...props.buttonProps,
      class: cx(cls(p, "sendButton", "urai-send"), "urai-focusable"),
      "data-urai-part": "send-button",
    },
    [h(p.icons.send)],
  );
});

export const DefaultArchiveButton = slot<ArchiveButtonSlotProps>(
  "DefaultArchiveButton",
  (props) => {
    const p = usePresentation();
    return h(
      "button",
      {
        ...props.buttonProps,
        class: cx(
          cls(p, "archiveButton", "urai-archive-button", { isDownloading: props.isDownloading }),
          "urai-focusable",
        ),
        "data-urai-part": "archive-button",
        "data-state": props.isDownloading ? "downloading" : "idle",
      },
      [h(p.icons.download)],
    );
  },
);

export const DefaultAttachButton = slot<AttachButtonSlotProps>(
  "DefaultAttachButton",
  (props) => {
    const p = usePresentation();
    return h(
      "button",
      {
        ...props.buttonProps,
        class: cx(cls(p, "attachButton", "urai-attach"), "urai-focusable"),
        "data-urai-part": "attach-button",
      },
      [h(p.icons.paperclip)],
    );
  },
);

export const DefaultPendingAttachment = slot<PendingAttachmentSlotProps>(
  "DefaultPendingAttachment",
  (props) => {
    const p = usePresentation();
    return h(
      "li",
      {
        class: cls(p, "pendingAttachment", "urai-pending-chip", {
          status: props.attachment.status,
        }),
        "data-urai-part": "pending-attachment",
        "data-state": props.attachment.status,
        title: props.attachment.errorMessage ?? props.attachment.fileName,
      },
      [
        h("span", { class: "urai-pending-chip-name" }, props.displayName),
        h(
          "button",
          { ...props.removeButtonProps, class: "urai-pending-chip-remove urai-focusable" },
          [h(p.icons.remove)],
        ),
      ],
    );
  },
);

export const DefaultThreadSwitcher = slot<ThreadSwitcherSlotProps>(
  "DefaultThreadSwitcher",
  (props) => {
    const p = usePresentation();
    return h(
      "div",
      { class: cls(p, "threadSwitcher", "urai-thread-switcher"), "data-urai-part": "thread-switcher" },
      [
        h("div", { class: "urai-thread-switcher-head" }, [
          props.searchInput,
          props.newConversationButton,
        ]),
        props.list,
      ],
    );
  },
);

export const DefaultThreadItem = slot<ThreadItemSlotProps>("DefaultThreadItem", (props) => {
  const p = usePresentation();
  return h(
    "button",
    {
      ...props.itemProps,
      class: cx(cls(p, "threadItem", "urai-thread-item", { isActive: props.isActive }), "urai-focusable"),
      "data-urai-part": "thread-item",
      "data-state": props.isActive ? "active" : undefined,
    },
    [
      h("span", { class: "urai-thread-title" }, props.title),
      props.preview ? h("span", { class: "urai-thread-preview" }, props.preview) : null,
      h("span", { class: "urai-thread-meta" }, props.relativeTime),
    ],
  );
});

export const DefaultFooter = slot<FooterSlotProps>("DefaultFooter", (props) => {
  const p = usePresentation();
  if (!props.text) return null;
  return h("div", { class: cls(p, "footer", "urai-footer"), "data-urai-part": "footer" }, props.text);
});

/**
 * Shown until the client mounts. Sized from the configured layout so the box
 * is reserved and nothing shifts when the real tree arrives. Rendered before
 * the root provides anything, so it must not use composables.
 */
export const DefaultFallback = slot<FallbackSlotProps>("DefaultFallback", (props) =>
  h("div", {
    class: "urai-fallback",
    "data-urai-part": "fallback",
    "aria-hidden": "true",
    style: { width: props.width, height: props.height },
  }),
);

export const defaultComponents: UraiChatComponents = {
  Header: DefaultHeader,
  ArchiveButton: DefaultArchiveButton,
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
  FileList: DefaultFileList,
  ComponentList: DefaultComponentList,
  DelegateList: DefaultDelegateList,
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
