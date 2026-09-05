/**
 * The conversation store: one state machine, no DOM.
 *
 * `createChatStore` is **pure** — it opens no connection, reads no
 * storage, starts no timer. Every side effect sits behind `start()`.
 * That is what makes it safe to construct in a React `useState`
 * initializer under StrictMode, and trivially seedable in tests.
 *
 * Two structural properties the views depend on:
 *
 *  - `getState()` returns a cached reference that changes only on a real
 *    transition. Building a snapshot per call is the classic
 *    `useSyncExternalStore` infinite-loop trap.
 *  - The in-flight turn lives in `state.stream`, separate from
 *    `state.messages`. During streaming, `messages` keeps its identity,
 *    so a memoized message row cannot re-render per token.
 */
import type { ResolvedConfig } from "../config";
import type { WidgetAttachment } from "../transport";
import type { WidgetEvent } from "../events";
import { createReasoning } from "./reasoning";
import { createToolActivity } from "./tool-activity";
import { hydrateHistory, commitStream } from "./messages";
import { createNullSessionStore, type SessionStore } from "./persistence";
import type { ChatTransport } from "./transport-port";
import type {
  ChatAttachment,
  ChatMessage,
  ChatState,
  PendingAttachment,
  WidgetVars,
} from "./types";

export interface ChatStoreDeps {
  transport: ChatTransport | null;
  config: ResolvedConfig;
  userId: string;
  vars?: WidgetVars | null;
  session?: SessionStore;
  emit?: (event: WidgetEvent) => void;
  /**
   * "raf" coalesces every transition landing in one frame into a single
   * notification — without it a fast stream notifies per token. "sync"
   * notifies immediately, which is what tests want so none of them need
   * fake timers. Defaults to "raf" in a browser, "sync" otherwise.
   */
  batch?: "raf" | "sync";
}

export interface ChatActions {
  /** Runs the mount-time effects: auto-restore. Idempotent. */
  start(): Promise<void>;
  /** Cancels in-flight work and re-arms; `start()` may be called again. */
  stop(): void;

  setDraft(text: string): void;
  send(text?: string): Promise<void>;

  addFiles(files: File[] | FileList): void;
  removeAttachment(localId: number): void;

  loadThreads(): Promise<void>;
  setThreadQuery(query: string): void;
  selectThread(threadId: string): Promise<void>;
  newConversation(vars?: WidgetVars | null): void;

  /**
   * Fetch a remote attachment's bytes. Views go through this rather
   * than the transport so they never need the visitor header — and so
   * an `<img src>` can never be used, which would leak one visitor's
   * files to another through the shared widget token.
   */
  fetchAttachmentBlob(attachment: ChatAttachment): Promise<Blob | null>;
  setUser(id: string, vars?: WidgetVars | null): void;
  setVars(vars: WidgetVars | null): void;
  applyConfig(config: ResolvedConfig): void;
}

export interface ChatStore {
  getState(): ChatState;
  subscribe(listener: () => void): () => void;
  actions: ChatActions;
  /** Flush a pending batched notification now. Tests and teardown. */
  flush(): void;
}

function initialState(deps: ChatStoreDeps): ChatState {
  return {
    config: deps.config,
    userId: deps.userId,
    vars: deps.vars ?? null,
    threadId: null,
    forceNewOnNextCreate: false,
    messages: [],
    stream: null,
    draft: "",
    attachments: [],
    status: "idle",
    threads: { items: null, query: "", loading: false },
    error: null,
  };
}

export function createChatStore(deps: ChatStoreDeps): ChatStore {
  const session = deps.session ?? createNullSessionStore();
  const emit = deps.emit ?? (() => {});
  const batch =
    deps.batch ??
    (typeof requestAnimationFrame === "function" ? "raf" : "sync");

  let state = initialState(deps);
  const listeners = new Set<() => void>();

  /**
   * Re-armable generation counter, not a one-way `destroyed` latch. A
   * latch cannot survive StrictMode's mount → unmount → mount, which
   * would leave the second mount permanently inert.
   */
  let gen = 0;
  let started = false;
  let scheduled = false;
  let closeStream: (() => void) | null = null;
  let localIdSeq = 0;
  const inflightUploads = new Set<Promise<void>>();
  let localMessageSeq = 0;

  function notify() {
    for (const l of [...listeners]) l();
  }

  function schedule(coalesce: boolean) {
    // Coalescing is for the streaming hot path only. Deferring a
    // composer keystroke by a frame would make a controlled input drop
    // characters, so every user-initiated transition notifies at once.
    if (!coalesce || batch === "sync") {
      if (scheduled) scheduled = false;
      notify();
      return;
    }
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      if (!scheduled) return;
      scheduled = false;
      notify();
    });
  }

  function set(patch: Partial<ChatState>, opts?: { coalesce?: boolean }) {
    state = { ...state, ...patch };
    schedule(!!opts?.coalesce);
  }

  function flush() {
    if (scheduled) {
      scheduled = false;
      notify();
    }
  }

  const nextLocalId = () => `local:${++localMessageSeq}`;

  function pushMessage(message: ChatMessage) {
    set({ messages: [...state.messages, message] });
  }

  function pushError(message: string) {
    pushMessage({
      id: nextLocalId(),
      role: "error",
      content: message,
      reasoning: null,
      attachments: [],
    });
  }

  function stopStream() {
    if (closeStream) {
      closeStream();
      closeStream = null;
    }
  }

  // ---------------------------------------------------------------
  // Threads
  // ---------------------------------------------------------------

  /**
   * Resolve the thread to send into, creating one if needed.
   *
   * The create path always sends `force_new: true`. The two ways in are
   * (a) the visitor never had a cached thread and (b) the cached one was
   * invalid — in both cases the visitor's expectation is "I'm starting
   * something new." Without it the server quietly resumes their most
   * recent thread, which makes the widget feel like it drops people into
   * a conversation they don't remember. Resuming a past thread is the
   * switcher's job, and that path goes through `selectThread`.
   *
   * Note `forceNewOnNextCreate` does NOT gate this — it only gates
   * auto-restore.
   */
  async function ensureThread(g: number): Promise<string> {
    if (!deps.transport) throw new Error("transport unavailable");
    if (state.threadId) return state.threadId;

    const cached = session.load();
    if (cached) {
      set({ threadId: cached });
      try {
        const msgs = await deps.transport.listMessages(cached);
        if (g !== gen) return cached;
        if (msgs.length > 0) set({ messages: hydrateHistory(msgs) });
      } catch {
        // Stale cache (e.g. the server rotated tokens) — drop and
        // start fresh rather than stranding the visitor.
        session.clear();
        set({ threadId: null });
      }
      if (state.threadId) return state.threadId;
    }

    const body: { force_new: boolean; vars?: WidgetVars } = { force_new: true };
    if (state.vars) body.vars = state.vars;
    const result = await deps.transport.createOrResumeThread(body);
    set({ threadId: result.thread_id, forceNewOnNextCreate: false });
    session.save(result.thread_id);
    return result.thread_id;
  }

  /**
   * Restore the visitor's last conversation. Skipped when a reset is
   * pending, so "New conversation" is not undone by a remount.
   */
  async function autoRestore(g: number): Promise<void> {
    if (!deps.transport) return;
    if (state.threadId || state.forceNewOnNextCreate) return;
    const cached = session.load();
    if (!cached) return;
    try {
      const msgs = await deps.transport.listMessages(cached);
      if (g !== gen) return;
      set({ threadId: cached, messages: hydrateHistory(msgs) });
    } catch {
      session.clear();
    }
  }

  // ---------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------

  function consumeStream(g: number, assistantMessageId: string) {
    if (!deps.transport) return;
    const tools = createToolActivity();
    const reasoning = createReasoning();

    set({
      status: "streaming",
      stream: {
        messageId: assistantMessageId,
        content: "",
        reasoning: null,
        tool: null,
        attached: false,
      },
    });

    /** Patch the stream slice, ignoring events from a superseded turn. */
    const patchStream = (
      patch: Partial<NonNullable<ChatState["stream"]>>,
    ): boolean => {
      if (g !== gen || !state.stream) return false;
      set({ stream: { ...state.stream, ...patch } }, { coalesce: true });
      return true;
    };

    /**
     * The bubble stays hidden behind a "thinking" affordance until the
     * first real output — content, reasoning, a tool call, complete, or
     * done. A reasoning-only turn still has to become visible.
     */
    const attach = () => {
      if (state.stream && !state.stream.attached) patchStream({ attached: true });
    };

    const syncModels = () =>
      patchStream({
        reasoning: reasoning.started ? reasoning.snapshot() : null,
        tool: tools.snapshot(),
      });

    closeStream = deps.transport.streamMessage(assistantMessageId, {
      onChunk(chunk) {
        if (g !== gen) return;
        attach();
        // Seal reasoning at the first answer token, not on every one.
        if (!state.stream?.content) {
          reasoning.seal();
        }
        patchStream({ content: (state.stream?.content ?? "") + chunk });
        syncModels();
      },
      onReasoning(chunk) {
        if (g !== gen) return;
        attach();
        reasoning.append(chunk);
        syncModels();
      },
      onCommand(command) {
        emit({ type: "command", command });
      },
      onToolCallStarted({ id, fn_name }) {
        if (g !== gen) return;
        attach();
        tools.start(id, fn_name);
        syncModels();
      },
      onToolCallCompleted({ id }) {
        if (g !== gen) return;
        tools.complete(id);
        syncModels();
      },
      onToolCallSummary({ id, summary }) {
        if (g !== gen) return;
        tools.setSummary(id, summary);
        syncModels();
      },
      onComplete(msg) {
        if (g !== gen) return;
        attach();
        if (msg?.content) {
          reasoning.seal();
          // Replaces the buffer — it does not append to it.
          patchStream({ content: msg.content });
          syncModels();
        }
      },
      onDone() {
        // Cleared before the generation check, so a stale turn still
        // releases its handle.
        closeStream = null;
        if (g !== gen) return;
        attach();
        tools.clear();
        const finished = state.stream;
        const content = finished?.content ?? "";
        set({
          messages: finished
            ? [...state.messages, commitStream(finished)]
            : state.messages,
          stream: null,
          status: "idle",
        });
        emit({ type: "assistant-reply", content });
      },
      onError(err) {
        closeStream = null;
        if (g !== gen) return;
        tools.clear();
        set({ stream: null, status: "idle" });
        pushError(err);
        emit({ type: "error", error: err });
      },
    });
  }

  // ---------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------

  /**
   * Wait for in-flight uploads. `ui.ts` polls every 50ms for this;
   * tracking the promises removes both the latency floor and the need
   * for timers in tests. The upload endpoint enforces the body cap and
   * fails fast, so there is no parallel timeout.
   */
  async function waitForUploads(): Promise<void> {
    while (inflightUploads.size > 0) {
      await Promise.allSettled([...inflightUploads]);
    }
  }

  async function send(explicitText?: string): Promise<void> {
    const g = gen;
    if (state.status !== "idle") return;
    const text = (explicitText ?? state.draft).trim();
    const hasPending = state.attachments.length > 0;
    if (!text && !hasPending) return;

    if (hasPending) {
      // Deliberate divergence from `ui.ts`, which flips sending back to
      // false between the wait and the real send: staying disabled
      // through the transition stops a second submit slipping in.
      set({ status: "sending" });
      await waitForUploads();
      if (g !== gen) return;
    }

    const ready = state.attachments.filter(
      (p): p is PendingAttachment & { uploaded: WidgetAttachment } =>
        p.status === "ready" && !!p.uploaded,
    );
    if (!text && ready.length === 0) {
      set({ status: "idle" });
      if (state.attachments.some((p) => p.status === "error")) {
        pushError("Attachment upload failed");
      }
      return;
    }

    const userMessage: ChatMessage = {
      id: nextLocalId(),
      role: "user",
      content: text,
      reasoning: null,
      attachments: ready.map((p) => ({
        kind: "local" as const,
        file: p.file,
        mimeType: p.mimeType,
        fileName: p.fileName,
      })),
    };

    set({
      draft: "",
      attachments: [],
      messages: [...state.messages, userMessage],
      status: "sending",
    });
    emit({ type: "user-message", content: text });

    if (!deps.transport) {
      set({ status: "idle" });
      return;
    }

    try {
      const threadId = await ensureThread(g);
      const sent = await deps.transport.sendMessage(
        threadId,
        text,
        ready.map((p) => p.uploaded),
      );
      if (g !== gen) return;
      consumeStream(g, sent.assistant_message_id);
    } catch (e: unknown) {
      if (g !== gen) return;
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: "idle" });
      pushError(msg);
      emit({ type: "error", error: msg });
    }
  }

  // ---------------------------------------------------------------
  // Uploads
  // ---------------------------------------------------------------

  async function upload(g: number, file: File) {
    if (!deps.transport) return;
    const pending: PendingAttachment = {
      localId: ++localIdSeq,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      file,
      status: "uploading",
    };
    set({ attachments: [...state.attachments, pending] });

    const patch = (next: Partial<PendingAttachment>) => {
      set({
        attachments: state.attachments.map((p) =>
          p.localId === pending.localId ? { ...p, ...next } : p,
        ),
      });
    };

    try {
      const uploaded = await deps.transport.uploadAttachment(file);
      if (g !== gen) return;
      patch({ status: "ready", uploaded, mimeType: uploaded.mime_type });
    } catch (e: unknown) {
      if (g !== gen) return;
      patch({
        status: "error",
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------

  const actions: ChatActions = {
    async start() {
      if (started) return;
      started = true;
      await autoRestore(gen);
    },

    stop() {
      // Bumping the generation is what makes every in-flight
      // continuation bail, and lets a later start() work again.
      gen += 1;
      started = false;
      stopStream();
      scheduled = false;
      // Drop the in-flight turn. Without this the slice survives, and a
      // StrictMode remount re-renders a stream that will never finish
      // (its handlers now bail on the generation check).
      if (state.stream || state.status !== "idle") {
        set({ stream: null, status: "idle" });
      }
    },

    setDraft(text) {
      set({ draft: text });
    },

    send,

    addFiles(files) {
      const g = gen;
      for (const file of Array.from(files)) {
        const p = upload(g, file).finally(() => inflightUploads.delete(p));
        inflightUploads.add(p);
      }
    },

    async fetchAttachmentBlob(attachment) {
      if (attachment.kind === "local") return attachment.file;
      if (!deps.transport) return null;
      try {
        return await deps.transport.fetchAttachment(
          attachment.messageId,
          attachment.attachment.id,
        );
      } catch (e) {
        console.warn("[UraiChat] attachment fetch failed:", e);
        return null;
      }
    },

    removeAttachment(localId) {
      set({
        attachments: state.attachments.filter((p) => p.localId !== localId),
      });
    },

    async loadThreads() {
      if (!deps.transport) return;
      const g = gen;
      set({ threads: { ...state.threads, loading: true } });
      try {
        const items = await deps.transport.listThreads();
        if (g !== gen) return;
        set({ threads: { ...state.threads, items, loading: false } });
      } catch (e) {
        if (g !== gen) return;
        // Silent: an empty switcher reads better than an error banner
        // over the conversation.
        console.warn("[UraiChat] thread list failed:", e);
        set({ threads: { ...state.threads, items: [], loading: false } });
      }
    },

    setThreadQuery(query) {
      set({ threads: { ...state.threads, query } });
    },

    async selectThread(threadId) {
      if (!deps.transport || state.threadId === threadId) return;
      const g = gen;
      stopStream();
      set({ threadId, messages: [], stream: null, status: "idle" });
      session.save(threadId);
      try {
        const msgs = await deps.transport.listMessages(threadId);
        if (g !== gen) return;
        set({ messages: hydrateHistory(msgs) });
      } catch (e) {
        if (g !== gen) return;
        pushError(e instanceof Error ? e.message : String(e));
      }
    },

    newConversation(vars) {
      stopStream();
      if (vars !== undefined) set({ vars });
      set({
        threadId: null,
        // Tell the next create to actually create. Also stops
        // auto-restore from snapping back to the old conversation.
        forceNewOnNextCreate: true,
        status: "idle",
        // The new thread has no server row until a message is sent, so
        // invalidate the list rather than showing a stale one.
        threads: { ...state.threads, items: null },
        messages: [],
        stream: null,
        attachments: [],
        error: null,
      });
    },

    setUser(id, vars) {
      const userChanged = id !== state.userId;
      if (userChanged) {
        stopStream();
        deps.transport?.setWidgetUserId(id);
        set({
          userId: id,
          threadId: null,
          // A new visitor is a fresh slate, so clear any pending
          // "new conversation" intent and let their threads restore.
          forceNewOnNextCreate: false,
          status: "idle",
          threads: { ...state.threads, items: null },
          messages: [],
          stream: null,
          attachments: [],
          error: null,
        });
      }
      // `undefined` means leave alone; explicit `null` clears.
      if (vars !== undefined) {
        set({ vars });
        if (!userChanged && deps.transport && state.threadId) {
          void deps.transport
            .updateThreadVars(state.threadId, vars)
            .catch((e) => console.warn("[UraiChat] setUser vars patch:", e));
        }
      }
    },

    setVars(vars) {
      set({ vars });
      if (deps.transport && state.threadId) {
        void deps.transport
          .updateThreadVars(state.threadId, vars)
          .catch((e) => console.warn("[UraiChat] setVars patch:", e));
      }
    },

    applyConfig(config) {
      set({ config });
    },
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions,
    flush,
  };
}
