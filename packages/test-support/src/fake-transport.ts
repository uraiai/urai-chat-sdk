// Resolved from source: this package is private, unbuilt and consumed
// only by the test suites, so it reaches into core's src rather than
// forcing a public entry point to exist purely for tests.
import type { ChatTransport } from "../../chat-widget-core/src/headless/transport-port";
import type {
  CreateThreadResult,
  SendMessageResult,
  ServerConfig,
  ServerMessage,
  StreamHandlers,
  ThreadSummary,
  WidgetAttachment,
} from "../../chat-widget-core/src/transport";
import { WidgetHttpError } from "../../chat-widget-core/src/transport";

export interface FakeTransportCall {
  method: string;
  args: unknown[];
}

export interface FakeTransportOptions {
  config?: Partial<ServerConfig>;
  threads?: ThreadSummary[];
  messages?: Record<string, ServerMessage[]>;
  /** Thread ids `listMessages` answers with a 404, as the server does for another visitor's thread. */
  missingThreads?: string[];
  /** Throw from a named method to exercise a failure branch. */
  fail?: Partial<Record<keyof ChatTransport, Error>>;
}

export interface FakeTransport extends ChatTransport {
  /** Every call, in order — the assertion vehicle for pipeline tests. */
  calls: FakeTransportCall[];
  /** Names only, for a compact `toEqual` on call ordering. */
  callNames(): string[];
  /** Handlers passed to the most recent `streamMessage`. */
  lastStreamHandlers(): StreamHandlers | null;
  /** True once the most recent stream's teardown ran. */
  streamClosed(): boolean;
  widgetUserId: string;
}

/**
 * An in-memory `ChatTransport` with a recorded call log. Needs no
 * globals at all — no `fetch` stub, no `EventSource` stub — which is
 * what keeps the headless suite fast and environment-independent.
 */
export function makeFakeTransport(
  opts: FakeTransportOptions = {},
): FakeTransport {
  const calls: FakeTransportCall[] = [];
  let handlers: StreamHandlers | null = null;
  let closed = false;
  let threadSeq = 0;
  let messageSeq = 0;

  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
    const err = opts.fail?.[method as keyof ChatTransport];
    if (err) throw err;
  };

  const t: FakeTransport = {
    calls,
    widgetUserId: "test-user",
    callNames: () => calls.map((c) => c.method),
    lastStreamHandlers: () => handlers,
    streamClosed: () => closed,

    setWidgetUserId(id) {
      record("setWidgetUserId", id);
      t.widgetUserId = id;
    },

    async fetchConfig() {
      record("fetchConfig");
      return {
        widget: { id: "w1", name: "Test", theme: {}, layout: {}, behavior: {} },
        assistant: { id: "a1", name: "Assistant", description: null },
        ...opts.config,
      } as ServerConfig;
    },

    async listThreads() {
      record("listThreads");
      return opts.threads ?? [];
    },

    async getThread(threadId) {
      record("getThread", threadId);
      const found = opts.threads?.find((x) => x.id === threadId);
      if (found) return found;
      if (opts.messages?.[threadId]) {
        return {
          id: threadId,
          title: `Thread ${threadId}`,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          last_message_at: null,
          last_message_preview: null,
        };
      }
      throw new WidgetHttpError(`get thread failed: 404`, 404);
    },

    async createOrResumeThread(body) {
      record("createOrResumeThread", body);
      return { thread_id: `t${++threadSeq}`, created: true } as CreateThreadResult;
    },

    async updateThreadVars(threadId, vars) {
      record("updateThreadVars", threadId, vars);
    },

    async updateThreadCollections(threadId, collections) {
      record("updateThreadCollections", threadId, collections);
    },

    async listMessages(threadId) {
      record("listMessages", threadId);
      if (opts.missingThreads?.includes(threadId)) {
        throw new WidgetHttpError(`list messages failed: 404`, 404);
      }
      return opts.messages?.[threadId] ?? [];
    },

    async sendMessage(threadId, content, attachments, vars) {
      record("sendMessage", threadId, content, attachments, vars);
      const n = ++messageSeq;
      return {
        user_message_id: `u${n}`,
        assistant_message_id: `a${n}`,
        thread_id: threadId,
        stream_url: `/stream/a${n}`,
      } as SendMessageResult;
    },

    async uploadAttachment(file) {
      record("uploadAttachment", file.name);
      return {
        file_name: file.name,
        mime_type: file.type,
        bucket_path: `uploads/${file.name}`,
      } as WidgetAttachment;
    },

    async fetchAttachment(messageId, attachmentId) {
      record("fetchAttachment", messageId, attachmentId);
      return new Blob(["fake"]);
    },

    async fetchThreadFile(threadId, path) {
      record("fetchThreadFile", threadId, path);
      return new Blob(["fake"]);
    },

    async fetchThreadArchive(threadId) {
      record("fetchThreadArchive", threadId);
      return { blob: new Blob(["zip"]), fileName: `${threadId}.zip` };
    },

    streamMessage(messageId, h) {
      record("streamMessage", messageId);
      handlers = h;
      closed = false;
      return () => {
        closed = true;
      };
    },
  };

  return t;
}
