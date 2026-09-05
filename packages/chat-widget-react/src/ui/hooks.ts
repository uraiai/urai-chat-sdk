"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type RefCallback,
  type TextareaHTMLAttributes,
} from "react";
import type {
  ChatMessage,
  ChatState,
  PendingAttachment,
  ThreadSummary,
} from "@uraiai/chat-widget-core/headless";
import {
  filterThreads,
  groupByRecency,
} from "@uraiai/chat-widget-core/headless";
import {
  shallowEqual,
  useChatActions,
  useChatSelector,
  useMessageId,
  usePresentation,
} from "./context";

export { useChatActions, useChatSelector, shallowEqual } from "./context";

export function useChatConfig() {
  return useChatSelector((s) => s.config);
}

export function useLabels() {
  return usePresentation().labels;
}

export function useIcons() {
  return usePresentation().icons;
}

export interface ChatStatusInfo {
  status: ChatState["status"];
  isStreaming: boolean;
  isSending: boolean;
  canSend: boolean;
  isEmpty: boolean;
  threadId: string | null;
}

export function useChatStatus(): ChatStatusInfo {
  return useChatSelector(
    (s) => ({
      status: s.status,
      isStreaming: s.status === "streaming",
      isSending: s.status !== "idle",
      canSend:
        s.status === "idle" &&
        (s.draft.trim().length > 0 || s.attachments.length > 0),
      isEmpty: s.messages.length === 0 && s.stream === null,
      threadId: s.threadId,
    }),
    shallowEqual,
  );
}

/**
 * Reference-stable unless a message is added or removed — this is what
 * stops the list re-rendering on every streamed token.
 */
export function useMessages(): ChatMessage[] {
  return useChatSelector((s) => s.messages);
}

export function useMessage(id?: string): ChatMessage {
  const messageId = useMessageId(id);
  const message = useChatSelector((s) =>
    s.messages.find((m) => m.id === messageId),
  );
  if (!message) throw new Error(`[UraiChat] no message with id ${messageId}`);
  return message;
}

/** The in-flight turn, or null. Only the streaming row subscribes to this. */
export function useStream() {
  return useChatSelector((s) => s.stream);
}

export interface UseComposerResult {
  value: string;
  setValue(v: string): void;
  submit(): void;
  canSubmit: boolean;
  isStreaming: boolean;
  placeholder: string;
  sendLabel: string;
  getFormProps(): FormHTMLAttributes<HTMLFormElement>;
  getInputProps(): TextareaHTMLAttributes<HTMLTextAreaElement> & {
    ref: RefCallback<HTMLTextAreaElement>;
  };
  getSendButtonProps(): ButtonHTMLAttributes<HTMLButtonElement>;
}

const MAX_COMPOSER_HEIGHT = 120;

export function useComposer(): UseComposerResult {
  const actions = useChatActions();
  const labels = useLabels();
  const { idPrefix } = usePresentation();
  const { draft, canSend, isStreaming, isSending } = useChatSelector(
    (s) => ({
      draft: s.draft,
      canSend:
        s.status === "idle" &&
        (s.draft.trim().length > 0 || s.attachments.length > 0),
      isStreaming: s.status === "streaming",
      isSending: s.status !== "idle",
    }),
    shallowEqual,
  );

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const autosize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, []);

  const submit = useCallback(() => {
    if (!canSend) return;
    void actions.send();
  }, [actions, canSend]);

  useEffect(() => {
    if (draft === "") autosize(inputRef.current);
  }, [draft, autosize]);

  return {
    value: draft,
    setValue: actions.setDraft,
    submit,
    canSubmit: canSend,
    isStreaming,
    placeholder: labels.placeholder,
    sendLabel: labels.send,

    getFormProps: () => ({
      onSubmit: (e) => {
        e.preventDefault();
        submit();
      },
    }),

    getInputProps: () => ({
      ref: (el) => {
        inputRef.current = el;
        autosize(el);
      },
      value: draft,
      rows: 1,
      placeholder: labels.placeholder,
      "aria-label": labels.placeholder,
      "aria-describedby": `${idPrefix}-composer-hint`,
      // Deliberately NOT disabled while sending: disabling steals focus
      // mid-turn and blocks typing ahead. Only the button changes.
      onChange: (e) => {
        actions.setDraft(e.target.value);
        autosize(e.currentTarget);
      },
      onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // `isComposing` guard: without it Enter commits a CJK IME
        // candidate AND sends the message, which makes the widget
        // unusable in Japanese, Chinese and Korean.
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !(e.nativeEvent as unknown as { isComposing?: boolean }).isComposing
        ) {
          e.preventDefault();
          submit();
        }
      },
    }),

    getSendButtonProps: () => ({
      type: "submit",
      disabled: !canSend,
      "aria-label": labels.send,
      "aria-busy": isSending || undefined,
    }),
  };
}

export interface UseAttachmentsResult {
  items: PendingAttachment[];
  supported: boolean;
  isUploading: boolean;
  add(files: File[] | FileList): void;
  remove(localId: number): void;
  getInputProps(): InputHTMLAttributes<HTMLInputElement> & {
    ref: RefCallback<HTMLInputElement>;
  };
  getTriggerProps(): ButtonHTMLAttributes<HTMLButtonElement>;
}

export function useAttachments(): UseAttachmentsResult {
  const actions = useChatActions();
  const labels = useLabels();
  const items = useChatSelector((s) => s.attachments);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return {
    items,
    supported: true,
    isUploading: items.some((p) => p.status === "uploading"),
    add: actions.addFiles,
    remove: actions.removeAttachment,
    getInputProps: () => ({
      ref: (el) => {
        inputRef.current = el;
      },
      type: "file",
      multiple: true,
      // Visually hidden rather than display:none, so it stays reachable
      // by assistive tech and by a programmatic .click().
      style: {
        position: "absolute",
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap",
        border: 0,
      },
      onChange: (e) => {
        const files = e.target.files;
        if (files && files.length > 0) actions.addFiles(files);
        e.target.value = "";
      },
    }),
    getTriggerProps: () => ({
      type: "button",
      "aria-label": labels.attachFiles,
      onClick: () => inputRef.current?.click(),
    }),
  };
}

export interface ThreadGroupView {
  label: string;
  threads: ThreadSummary[];
}

export interface UseThreadsResult {
  status: "idle" | "loading" | "ready";
  query: string;
  setQuery(q: string): void;
  groups: ThreadGroupView[];
  results: ThreadSummary[];
  activeThreadId: string | null;
  select(id: string): void;
  create(): void;
  refresh(): void;
  emptyMessage: string;
  formatRelativeTime(iso: string): string;
}

export function useThreads(): UseThreadsResult {
  const actions = useChatActions();
  const labels = useLabels();
  const { items, query, loading, activeThreadId } = useChatSelector(
    (s) => ({
      items: s.threads.items,
      query: s.threads.query,
      loading: s.threads.loading,
      activeThreadId: s.threadId,
    }),
    shallowEqual,
  );

  const results = useMemo(
    () => filterThreads(items ?? [], query),
    [items, query],
  );
  const groups = useMemo(
    () => groupByRecency(results).map(([label, threads]) => ({ label, threads })),
    [results],
  );

  const emptyMessage =
    items === null
      ? labels.loadingThreads
      : query.trim()
        ? labels.noMatches
        : labels.noThreads;

  return {
    status: loading ? "loading" : items === null ? "idle" : "ready",
    query,
    setQuery: actions.setThreadQuery,
    groups,
    results,
    activeThreadId,
    select: (id) => void actions.selectThread(id),
    create: () => actions.newConversation(),
    refresh: () => void actions.loadThreads(),
    emptyMessage,
    formatRelativeTime: (iso) => labels.relativeTime(iso),
  };
}

export interface UseStickToBottomResult {
  scrollRef: RefCallback<HTMLElement>;
  contentRef: RefCallback<HTMLElement>;
  isPinned: boolean;
  scrollToBottom(opts?: { behavior?: ScrollBehavior }): void;
}

/**
 * Follow the bottom of the transcript without fighting the reader.
 *
 * Growth is observed with a `ResizeObserver` on the content element
 * rather than being pushed from call sites, so a late-loading attachment
 * image or an expanding disclosure follows too. Unpinning distinguishes
 * user scrolling from our own writes, and also listens for wheel/touch/
 * key intent — which catches a scroll-up that content growth immediately
 * outruns.
 */
export function useStickToBottom(threshold = 40): UseStickToBottomResult {
  const scrollEl = useRef<HTMLElement | null>(null);
  const [isPinned, setPinned] = useState(true);
  const pinnedRef = useRef(true);
  const programmatic = useRef(false);

  const setPinnedBoth = useCallback((v: boolean) => {
    pinnedRef.current = v;
    setPinned(v);
  }, []);

  const scrollToBottom = useCallback(
    (opts?: { behavior?: ScrollBehavior }) => {
      const el = scrollEl.current;
      if (!el) return;
      programmatic.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior: opts?.behavior ?? "auto" });
      setPinnedBoth(true);
    },
    [setPinnedBoth],
  );

  const atBottom = useCallback(
    (el: HTMLElement) =>
      el.scrollHeight - el.scrollTop - el.clientHeight <= threshold,
    [threshold],
  );

  const scrollRef = useCallback<RefCallback<HTMLElement>>(
    (el) => {
      scrollEl.current = el;
      if (!el) return;
      // The browser's own scroll anchoring fights this hook.
      el.style.overflowAnchor = "none";

      const onScroll = () => {
        if (programmatic.current) {
          programmatic.current = false;
          return;
        }
        setPinnedBoth(atBottom(el));
      };
      const onIntent = () => {
        if (!atBottom(el)) setPinnedBoth(false);
      };

      el.addEventListener("scroll", onScroll, { passive: true });
      el.addEventListener("wheel", onIntent, { passive: true });
      el.addEventListener("touchmove", onIntent, { passive: true });
    },
    [atBottom, setPinnedBoth],
  );

  const contentRef = useCallback<RefCallback<HTMLElement>>(
    (el) => {
      if (!el || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => {
        // While streaming, "auto" not "smooth": smooth-scrolling a
        // container that grows every frame lags permanently behind.
        if (pinnedRef.current) scrollToBottom({ behavior: "auto" });
      });
      ro.observe(el);
    },
    [scrollToBottom],
  );

  return { scrollRef, contentRef, isPinned, scrollToBottom };
}
