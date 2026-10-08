import {
  computed,
  onScopeDispose,
  ref,
  watch,
  type ButtonHTMLAttributes,
  type ComputedRef,
  type FormHTMLAttributes,
  type InputHTMLAttributes,
  type Ref,
  type ShallowRef,
  type TextareaHTMLAttributes,
  type VNodeRef,
} from "vue";
import type { ResolvedConfig } from "@uraiai/chat-widget-core";
import { saveBlob } from "@uraiai/chat-widget-core";
import {
  filterThreads,
  groupByRecency,
  threadHasFiles,
  type ChatMessage,
  type ChatState,
  type PendingAttachment,
  type ThreadSummary,
  type UraiChatLabels,
} from "@uraiai/chat-widget-core/headless";
import {
  shallowEqual,
  useChatActions,
  useChatSelector,
  useMessageId,
  usePresentation,
} from "./context";
import type { UraiChatIcons } from "./icons";

/**
 * The composables the default parts consume — the same contract as the
 * React hooks, under the same names.
 *
 * Vue conventions apply to the return values: a single value comes back as a
 * read-only ref (`useChatStatus().value.isStreaming`), and the richer ones
 * (`useComposer`, `useAttachments`, `useThreads`, `useThreadArchive`) return
 * an object whose state properties are getters. Read those inside a render
 * function, template or `computed` and they are tracked; destructuring them
 * in `setup` takes a snapshot.
 */

export { useChatActions, useChatSelector, shallowEqual } from "./context";

export function useChatConfig(): Readonly<ShallowRef<ResolvedConfig>> {
  return useChatSelector((s) => s.config);
}

export function useLabels(): ComputedRef<UraiChatLabels> {
  const p = usePresentation();
  return computed(() => p.labels);
}

export function useIcons(): ComputedRef<UraiChatIcons> {
  const p = usePresentation();
  return computed(() => p.icons);
}

export interface ChatStatusInfo {
  status: ChatState["status"];
  isStreaming: boolean;
  isSending: boolean;
  canSend: boolean;
  isEmpty: boolean;
  threadId: string | null;
}

function canSendOf(s: ChatState): boolean {
  return (
    !s.readOnly &&
    s.threadLoad !== "loading" &&
    s.status === "idle" &&
    (s.draft.trim().length > 0 || s.attachments.length > 0)
  );
}

export function useChatStatus(): Readonly<ShallowRef<ChatStatusInfo>> {
  return useChatSelector(
    (s) => ({
      status: s.status,
      isStreaming: s.status === "streaming",
      isSending: s.status !== "idle",
      canSend: canSendOf(s),
      isEmpty: s.messages.length === 0 && s.stream === null,
      threadId: s.threadId,
    }),
    shallowEqual,
  );
}

/**
 * The id of the conversation on screen, or `null` before the first message
 * creates one. Save it from `thread-change` rather than watching this —
 * this is for rendering (a "copy link" button, a debug readout).
 */
export function useThreadId(): Readonly<ShallowRef<string | null>> {
  return useChatSelector((s) => s.threadId);
}

export interface UseThreadResult {
  threadId: string | null;
  /** Title and timestamps of a thread the host opened; `null` otherwise. */
  summary: ChatState["thread"];
  /** Progress of a host-requested open — see `ChatState.threadLoad`. */
  load: ChatState["threadLoad"];
  readOnly: boolean;
}

export function useThread(): Readonly<ShallowRef<UseThreadResult>> {
  return useChatSelector(
    (s) => ({
      threadId: s.threadId,
      summary: s.thread,
      load: s.threadLoad,
      readOnly: s.readOnly,
    }),
    shallowEqual,
  );
}

/**
 * Reference-stable unless a message is added, removed or updated — this is
 * what stops the list re-rendering on every streamed token.
 */
export function useMessages(): Readonly<ShallowRef<ChatMessage[]>> {
  return useChatSelector((s) => s.messages);
}

/**
 * One message, by id or from the enclosing `<Chat.Message>`. `undefined`
 * once the message leaves the transcript.
 */
export function useMessage(id?: string): Readonly<ShallowRef<ChatMessage | undefined>> {
  const messageId = useMessageId(id);
  return useChatSelector((s) => s.messages.find((m) => m.id === messageId));
}

/** The in-flight turn, or null. Only the streaming row subscribes to this. */
export function useStream(): Readonly<ShallowRef<ChatState["stream"]>> {
  return useChatSelector((s) => s.stream);
}

export interface UseComposerResult {
  readonly value: string;
  setValue(v: string): void;
  submit(): void;
  readonly canSubmit: boolean;
  readonly isStreaming: boolean;
  readonly placeholder: string;
  readonly sendLabel: string;
  getFormProps(): FormHTMLAttributes;
  /**
   * Attributes and listeners for the `<textarea>`. No `ref` — the composer
   * finds the element from its own events, so these can be bound to a
   * replacement component as well as to a bare textarea.
   */
  getInputProps(): TextareaHTMLAttributes & { value: string };
  getSendButtonProps(): ButtonHTMLAttributes;
}

const MAX_COMPOSER_HEIGHT = 120;

function autosize(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
}

export function useComposer(): UseComposerResult {
  const actions = useChatActions();
  const presentation = usePresentation();
  const state = useChatSelector(
    (s) => ({
      draft: s.draft,
      canSend: canSendOf(s),
      isStreaming: s.status === "streaming",
      isSending: s.status !== "idle",
    }),
    shallowEqual,
  );

  let inputEl: HTMLTextAreaElement | null = null;
  const track = (e: Event) => {
    if (e.currentTarget instanceof HTMLTextAreaElement) inputEl = e.currentTarget;
  };

  // A send clears the draft; shrink the box back to one row.
  watch(
    () => state.value.draft,
    (draft) => {
      if (draft === "") autosize(inputEl);
    },
    { flush: "post" },
  );

  const submit = () => {
    if (!state.value.canSend) return;
    void actions.send();
  };

  return {
    get value() {
      return state.value.draft;
    },
    setValue: (v) => actions.setDraft(v),
    submit,
    get canSubmit() {
      return state.value.canSend;
    },
    get isStreaming() {
      return state.value.isStreaming;
    },
    get placeholder() {
      return presentation.labels.placeholder;
    },
    get sendLabel() {
      return presentation.labels.send;
    },

    getFormProps: () => ({
      onSubmit: (e: Event) => {
        e.preventDefault();
        submit();
      },
    }),

    getInputProps: () => ({
      value: state.value.draft,
      rows: 1,
      placeholder: presentation.labels.placeholder,
      "aria-label": presentation.labels.placeholder,
      "aria-describedby": `${presentation.idPrefix}-composer-hint`,
      // Deliberately NOT disabled while sending: disabling steals focus
      // mid-turn and blocks typing ahead. Only the button changes.
      onFocus: track,
      onInput: (e: Event) => {
        track(e);
        const el = e.currentTarget as HTMLTextAreaElement;
        actions.setDraft(el.value);
        autosize(el);
      },
      onKeydown: (e: KeyboardEvent) => {
        track(e);
        // `isComposing` guard: without it Enter commits a CJK IME
        // candidate AND sends the message, which makes the chat
        // unusable in Japanese, Chinese and Korean.
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          submit();
        }
      },
    }),

    getSendButtonProps: () => ({
      type: "submit",
      disabled: !state.value.canSend,
      "aria-label": presentation.labels.send,
      "aria-busy": state.value.isSending || undefined,
    }),
  };
}

export interface UseAttachmentsResult {
  readonly items: PendingAttachment[];
  readonly supported: boolean;
  readonly isUploading: boolean;
  add(files: File[] | FileList): void;
  remove(localId: number): void;
  /** For the hidden `<input type="file">`; carries a function `ref`. */
  getInputProps(): InputHTMLAttributes & { ref: VNodeRef };
  getTriggerProps(): ButtonHTMLAttributes;
}

export function useAttachments(): UseAttachmentsResult {
  const actions = useChatActions();
  const presentation = usePresentation();
  const items = useChatSelector((s) => s.attachments);
  let inputEl: HTMLInputElement | null = null;

  return {
    get items() {
      return items.value;
    },
    supported: true,
    get isUploading() {
      return items.value.some((p) => p.status === "uploading");
    },
    add: (files) => actions.addFiles(files),
    remove: (id) => actions.removeAttachment(id),
    getInputProps: () => ({
      ref: (el: unknown) => {
        inputEl = el instanceof HTMLInputElement ? el : null;
      },
      type: "file",
      multiple: true,
      // Visually hidden rather than display:none, so it stays reachable
      // by assistive tech and by a programmatic .click().
      style: {
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: 0,
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap",
        border: 0,
      },
      onChange: (e: Event) => {
        const input = e.target as HTMLInputElement;
        const files = input.files;
        if (files && files.length > 0) actions.addFiles(files);
        input.value = "";
      },
    }),
    getTriggerProps: () => ({
      type: "button",
      "aria-label": presentation.labels.attachFiles,
      onClick: () => inputEl?.click(),
    }),
  };
}

export interface ThreadGroupView {
  label: string;
  threads: ThreadSummary[];
}

export interface UseThreadArchiveResult {
  /** True once the conversation has shown the visitor at least one file. */
  readonly available: boolean;
  readonly isDownloading: boolean;
  /** Fetch the whole workspace as a zip and save it. */
  download(): Promise<void>;
  readonly buttonProps: ButtonHTMLAttributes;
}

/**
 * Download the conversation's files as one zip.
 *
 * Fetched through the store — the visitor header is the only thing scoping
 * the read — then handed to the browser's download manager under the name
 * the server gave it. A failure leaves an error row.
 */
export function useThreadArchive(): UseThreadArchiveResult {
  const actions = useChatActions();
  const presentation = usePresentation();
  const available = useChatSelector(
    (s) => !!s.threadId && threadHasFiles(s.messages, s.stream),
  );
  const isDownloading = useChatSelector((s) => s.archive === "downloading");

  const download = async () => {
    const archive = await actions.downloadArchive();
    if (archive) saveBlob(archive.blob, archive.fileName);
  };

  return {
    get available() {
      return available.value;
    },
    get isDownloading() {
      return isDownloading.value;
    },
    download,
    get buttonProps(): ButtonHTMLAttributes {
      const labels = presentation.labels;
      const busy = isDownloading.value;
      return {
        type: "button",
        "aria-label": busy ? labels.downloadingFiles : labels.downloadAllFiles,
        title: busy ? labels.downloadingFiles : labels.downloadAllFiles,
        "aria-busy": busy || undefined,
        disabled: busy,
        onClick: () => void download(),
      };
    },
  };
}

export interface UseThreadsResult {
  readonly status: "idle" | "loading" | "ready";
  readonly query: string;
  setQuery(q: string): void;
  readonly groups: ThreadGroupView[];
  readonly results: ThreadSummary[];
  readonly activeThreadId: string | null;
  select(id: string): void;
  create(): void;
  refresh(): void;
  readonly emptyMessage: string;
  formatRelativeTime(iso: string): string;
}

export function useThreads(): UseThreadsResult {
  const actions = useChatActions();
  const presentation = usePresentation();
  const state = useChatSelector(
    (s) => ({
      items: s.threads.items,
      query: s.threads.query,
      loading: s.threads.loading,
      activeThreadId: s.threadId,
    }),
    shallowEqual,
  );

  const results = computed(() =>
    filterThreads(state.value.items ?? [], state.value.query),
  );
  const groups = computed(() =>
    groupByRecency(results.value).map(([label, threads]) => ({ label, threads })),
  );

  return {
    get status() {
      return state.value.loading
        ? "loading"
        : state.value.items === null
          ? "idle"
          : "ready";
    },
    get query() {
      return state.value.query;
    },
    setQuery: (q) => actions.setThreadQuery(q),
    get groups() {
      return groups.value;
    },
    get results() {
      return results.value;
    },
    get activeThreadId() {
      return state.value.activeThreadId;
    },
    select: (id) => void actions.selectThread(id),
    create: () => actions.newConversation(),
    refresh: () => void actions.loadThreads(),
    get emptyMessage() {
      const labels = presentation.labels;
      return state.value.items === null
        ? labels.loadingThreads
        : state.value.query.trim()
          ? labels.noMatches
          : labels.noThreads;
    },
    formatRelativeTime: (iso) => presentation.labels.relativeTime(iso),
  };
}

export interface UseStickToBottomResult {
  /** A function ref for the scrolling element. */
  scrollRef: (el: unknown) => void;
  /** A function ref for the element whose growth should be followed. */
  contentRef: (el: unknown) => void;
  isPinned: Readonly<Ref<boolean>>;
  scrollToBottom(opts?: { behavior?: ScrollBehavior }): void;
}

/**
 * Follow the bottom of the transcript without fighting the reader.
 *
 * Growth is observed with a `ResizeObserver` on the content element rather
 * than being pushed from call sites, so a late-loading attachment image or
 * an expanding disclosure follows too. Unpinning distinguishes user
 * scrolling from our own writes, and also listens for wheel/touch intent —
 * which catches a scroll-up that content growth immediately outruns.
 */
export function useStickToBottom(threshold = 40): UseStickToBottomResult {
  const isPinned = ref(true);
  let pinned = true;
  let programmatic = false;
  let scrollEl: HTMLElement | null = null;
  let contentEl: HTMLElement | null = null;
  let detachScroll: (() => void) | null = null;
  let observer: ResizeObserver | null = null;

  const setPinned = (v: boolean) => {
    pinned = v;
    isPinned.value = v;
  };

  const atBottom = (el: HTMLElement) =>
    el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

  const scrollToBottom = (opts?: { behavior?: ScrollBehavior }) => {
    const el = scrollEl;
    if (!el) return;
    programmatic = true;
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: opts?.behavior ?? "auto" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
    setPinned(true);
  };

  // Vue calls a function ref on every patch, so both refs ignore a repeat
  // of the element they already hold.
  const scrollRef = (raw: unknown) => {
    const el = raw instanceof HTMLElement ? raw : null;
    if (el === scrollEl) return;
    detachScroll?.();
    detachScroll = null;
    scrollEl = el;
    if (!el) return;
    // The browser's own scroll anchoring fights this composable.
    el.style.overflowAnchor = "none";
    const onScroll = () => {
      if (programmatic) {
        programmatic = false;
        return;
      }
      setPinned(atBottom(el));
    };
    const onIntent = () => {
      if (!atBottom(el)) setPinned(false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onIntent, { passive: true });
    el.addEventListener("touchmove", onIntent, { passive: true });
    detachScroll = () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onIntent);
      el.removeEventListener("touchmove", onIntent);
    };
  };

  const contentRef = (raw: unknown) => {
    const el = raw instanceof HTMLElement ? raw : null;
    if (el === contentEl) return;
    observer?.disconnect();
    observer = null;
    contentEl = el;
    if (!el || typeof ResizeObserver === "undefined") return;
    observer = new ResizeObserver(() => {
      // While streaming, "auto" not "smooth": smooth-scrolling a container
      // that grows every frame lags permanently behind.
      if (pinned) scrollToBottom({ behavior: "auto" });
    });
    observer.observe(el);
  };

  onScopeDispose(() => {
    detachScroll?.();
    observer?.disconnect();
  });

  return { scrollRef, contentRef, isPinned, scrollToBottom };
}
