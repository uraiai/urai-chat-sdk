/**
 * The transport surface the headless models depend on.
 *
 * `Transport` (a real `fetch`/`EventSource` client) satisfies this
 * structurally — there is no `implements` clause and no runtime cost.
 * Depending on the interface rather than the class is what lets tests
 * inject a plain object with a call log, and what will let the designer
 * preview swap in a fake that never talks to a server.
 */
import type {
  CreateThreadResult,
  SendMessageResult,
  ServerConfig,
  ServerMessage,
  StreamHandlers,
  ThreadSummary,
  WidgetAttachment,
} from "../transport";

export interface ChatTransport {
  /** Re-scope subsequent requests after the embedder changes visitor identity. */
  setWidgetUserId(id: string): void;

  fetchConfig(): Promise<ServerConfig>;

  listThreads(): Promise<ThreadSummary[]>;
  createOrResumeThread(body?: {
    force_new?: boolean;
    title?: string;
    vars?: Record<string, unknown> | null;
  }): Promise<CreateThreadResult>;
  updateThreadVars(
    threadId: string,
    vars: Record<string, unknown> | null,
  ): Promise<void>;

  listMessages(threadId: string): Promise<ServerMessage[]>;
  sendMessage(
    threadId: string,
    content: string,
    attachments?: WidgetAttachment[],
  ): Promise<SendMessageResult>;

  uploadAttachment(file: File): Promise<WidgetAttachment>;
  fetchAttachment(messageId: string, attachmentId: string): Promise<Blob>;

  /** Returns a teardown function that closes the stream. */
  streamMessage(messageId: string, handlers: StreamHandlers): () => void;
}

/**
 * Compile-time proof that the concrete client still satisfies the port.
 * The constraint is what does the work: if a method is added to
 * `Transport` and not here, or a signature drifts, this fails typecheck
 * rather than surfacing as a confusing test failure later.
 */
type MustSatisfy<TActual extends TExpected, TExpected> = TActual;
export type _TransportSatisfiesPort = MustSatisfy<
  import("../transport").Transport,
  ChatTransport
>;
