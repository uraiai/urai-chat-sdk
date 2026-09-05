"use client";

import { forwardRef, type CSSProperties } from "react";
import { ChatRoot, type ChatRootProps, type UraiChatHandle } from "./root";
import {
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

export type UraiChatProps = Omit<ChatRootProps, "children"> & {
  className?: string;
  style?: CSSProperties;
};

/**
 * The batteries-included inline chat: `<Chat.Root>` plus the canonical
 * default tree. Fills whatever box the host sizes.
 *
 * Swap any part with `components`, restyle with `classNames` or plain
 * CSS on `[data-urai-part]`, or drop down to `<Chat.Root>` and compose
 * the tree yourself.
 */
export const UraiChat = forwardRef<UraiChatHandle, UraiChatProps>(
function UraiChat(props, ref) {
  return (
    <ChatRoot {...props} ref={ref}>
      <Header />
      <Viewport>
        <EmptyState />
        <MessageList />
      </Viewport>
      <Composer />
      <Footer />
      <LiveRegion />
    </ChatRoot>
  );
});

/**
 * The compound API, for recomposing the shell. Also exported flat
 * (`ChatRoot`, `ChatComposer`, …) — the namespace object is friendlier
 * to read but defeats tree-shaking, so the flat names are the
 * bundle-conscious path.
 */
export const Chat = {
  Root: ChatRoot,
  Header,
  ThreadTrigger,
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
  Header as ChatHeader,
  ThreadSwitcher as ChatThreadSwitcher,
  Viewport as ChatViewport,
  MessageList as ChatMessageList,
  Message as ChatMessage,
  Composer as ChatComposer,
  Footer as ChatFooter,
  LiveRegion as ChatLiveRegion,
};

export type { ChatRootProps, UraiChatHandle };

// Hooks — the contract the defaults themselves consume.
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
  useThreads,
} from "./hooks";

// Slots: every default is exported so wrapping is a one-liner.
export {
  defaultComponents,
  DefaultAssistantMessage,
  DefaultAttachButton,
  DefaultAttachmentList,
  DefaultComposer,
  DefaultComposerInput,
  DefaultEmptyState,
  DefaultErrorMessage,
  DefaultFallback,
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

export { defaultIcons, type UraiChatIcon, type UraiChatIcons } from "./icons";
export {
  DEFAULT_LABELS,
  resolveLabels,
  type UraiChatLabels,
  type UraiChatLabelsInput,
} from "./labels";
export {
  cx,
  type ClassValue,
  type StatefulClass,
  type UraiChatClassNames,
} from "./class-names";
export { ensureStyles, stylesheet } from "./styles";
export { Markdown as MarkdownRenderer, splitStableTail } from "./markdown";

export type {
  ChatMessage as ChatMessageData,
  ChatState,
  ChatStatus,
  PendingAttachment,
  StreamSlice,
} from "@uraiai/chat-widget-core/headless";
