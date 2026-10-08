import { defineComponent, h, ref } from "vue";
import {
  ChatRoot,
  chatRootEmits,
  chatRootProps,
  forwardChatHandle,
  type ColorSchemePreference,
  type ThreadChangeInfo,
  type UraiChatHandle,
} from "./root";
import {
  ArchiveButton,
  Composer,
  EmptyState,
  Footer,
  Header,
  LiveRegion,
  Markdown,
  Message,
  MessageList,
  StreamingMessage,
  ThreadSwitcher,
  ThreadTrigger,
  Viewport,
} from "./parts";

/**
 * The batteries-included inline chat: `<ChatRoot>` plus the canonical
 * default tree. Fills whatever box the host sizes.
 *
 * Swap any part with `components` (or a named scoped slot of the same
 * name), restyle with `classNames` or plain CSS on `[data-urai-part]`, or
 * drop down to `<ChatRoot>` and compose the tree yourself. The template ref
 * is a `UraiChatHandle`.
 */
export const UraiChat = defineComponent({
  name: "UraiChat",
  inheritAttrs: false,
  props: chatRootProps,
  emits: chatRootEmits,
  setup(props, { emit, slots, attrs, expose }) {
    const root = ref<UraiChatHandle | null>(null);
    expose(forwardChatHandle(() => root.value));
    return () =>
      h(
        ChatRoot,
        {
          ...attrs,
          ...props,
          ref: root,
          onReady: () => emit("ready"),
          "onUser-message": (c: string) => emit("user-message", c),
          "onAssistant-reply": (c: string) => emit("assistant-reply", c),
          onCommand: (c: unknown) => emit("command", c),
          onError: (e: string) => emit("error", e),
          "onThread-change": (id: string | null, info: ThreadChangeInfo) =>
            emit("thread-change", id, info),
        },
        {
          ...slots,
          default: () => [
            h(Header),
            h(Viewport, null, { default: () => [h(EmptyState), h(MessageList)] }),
            h(Composer),
            h(Footer),
            h(LiveRegion),
          ],
        },
      );
  },
});

/**
 * The compound API, for recomposing the shell. Also exported flat
 * (`ChatRoot`, `ChatComposer`, …) — the namespace object is friendlier to
 * read but defeats tree-shaking, so the flat names are the bundle-conscious
 * path.
 */
export const Chat = {
  Root: ChatRoot,
  Header,
  ThreadTrigger,
  ArchiveButton,
  ThreadSwitcher,
  Viewport,
  MessageList,
  Message,
  StreamingMessage,
  Markdown,
  EmptyState,
  Composer,
  Footer,
  LiveRegion,
};

export {
  ChatRoot,
  chatRootProps,
  chatRootEmits,
  Header as ChatHeader,
  ThreadTrigger as ChatThreadTrigger,
  ArchiveButton as ChatArchiveButton,
  ThreadSwitcher as ChatThreadSwitcher,
  Viewport as ChatViewport,
  MessageList as ChatMessageList,
  Message as ChatMessage,
  StreamingMessage as ChatStreamingMessage,
  Markdown as ChatMarkdown,
  EmptyState as ChatEmptyState,
  Composer as ChatComposer,
  Footer as ChatFooter,
  LiveRegion as ChatLiveRegion,
};

export type { ColorSchemePreference, ThreadChangeInfo, UraiChatHandle };

// Composables — the contract the defaults themselves consume.
export {
  shallowEqual,
  useAttachments,
  useChatActions,
  useChatConfig,
  useChatSelector,
  useChatStatus,
  useComposer,
  useIcons,
  useLabels,
  useMessage,
  useMessages,
  useStickToBottom,
  useStream,
  useThread,
  useThreadArchive,
  useThreadId,
  useThreads,
  type ChatStatusInfo,
  type ThreadGroupView,
  type UseAttachmentsResult,
  type UseComposerResult,
  type UseStickToBottomResult,
  type UseThreadArchiveResult,
  type UseThreadResult,
  type UseThreadsResult,
} from "./composables";
export {
  useChatStore,
  useMessageId,
  usePresentation,
  type PresentationContextValue,
} from "./context";

// Slots: every default is exported so wrapping is a one-liner.
export {
  defaultComponents,
  DefaultArchiveButton,
  DefaultAssistantMessage,
  DefaultAttachButton,
  DefaultAttachmentList,
  DefaultComponentList,
  DefaultComposer,
  DefaultComposerInput,
  DefaultDelegateList,
  DefaultEmptyState,
  DefaultErrorMessage,
  DefaultFallback,
  DefaultFileList,
  DefaultFooter,
  DefaultHeader,
  DefaultMarkdown,
  DefaultPendingAttachment,
  DefaultReasoning,
  DefaultScrollToBottomButton,
  DefaultSendButton,
  DefaultStreamingMessage,
  DefaultSuggestedQuestions,
  DefaultThinkingIndicator,
  DefaultThreadItem,
  DefaultThreadSwitcher,
  DefaultToolActivity,
  DefaultToolCallCard,
  DefaultUserMessage,
} from "./components/defaults";

export type * from "./components/registry";
export { SLOT_NAMES } from "./components/registry";
export {
  DisplayComponent,
  DisplayComponentBoundary,
  displayComponentPropsOptions,
  lookupDisplayComponent,
} from "./components/display-component";

export { defaultIcons, type UraiChatIcon, type UraiChatIcons } from "./icons";
export {
  DEFAULT_LABELS,
  resolveLabels,
  cx,
  type UraiChatLabels,
  type UraiChatLabelsInput,
  type ClassValue,
  type StatefulClass,
  type UraiChatClassNames,
} from "@uraiai/chat-widget-core/headless";
export { ensureStyles, stylesheet } from "@uraiai/chat-widget-core/theme";
export { Markdown as MarkdownRenderer } from "./markdown";
export { splitStableTail } from "@uraiai/chat-widget-core/headless";

export type {
  ChatMessage as ChatMessageData,
  ChatState,
  ChatStatus,
  DelegateStatus,
  MessageComponent,
  MessageDelegate,
  PendingAttachment,
  StreamSlice,
  WorkspaceFile,
} from "@uraiai/chat-widget-core/headless";
