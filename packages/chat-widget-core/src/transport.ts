// HTTP + SSE transport against the chat-service public widget API.
//
// All requests include the X-Widget-User-Id header — the embedding app's
// stable identifier for its visitor. Server-side, this is treated as
// opaque text; trust comes from the widget token + Origin allowlist.

export interface TransportOptions {
  /** Origin (or origin + path prefix) of the chat-service deployment. */
  baseUrl: string;
  widgetToken: string;
  widgetUserId: string;
}

export interface ServerConfig {
  widget: {
    id: string;
    name: string;
    theme: Record<string, unknown>;
    layout: Record<string, unknown>;
    behavior: Record<string, unknown>;
  };
  assistant: {
    id: string;
    name: string;
    description: string | null;
  };
}

export interface ServerMessage {
  id: string;
  thread_id: string;
  message_idx: number;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning: string | null;
  created_at: string;
  attachments?: WidgetMessageAttachment[] | null;
}

/**
 * Reference to a file the visitor has uploaded but not yet attached to
 * a message. Returned by `uploadAttachment`; passed verbatim into the
 * next `sendMessage` call. `bucket_path` is opaque and scoped to the
 * visitor server-side — re-validated on every send.
 */
export interface WidgetAttachment {
  file_name: string;
  mime_type: string;
  bucket_path: string;
}

/**
 * Attachment as it appears on a persisted message. Note the absence
 * of `bucket_path` — the server never reveals the storage layout to
 * widget visitors. Use `Transport.fetchAttachment(messageId, id)` to
 * fetch the bytes back.
 */
export interface WidgetMessageAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  description: string | null;
}

export interface ThreadSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
}

export interface SendMessageResult {
  user_message_id: string;
  assistant_message_id: string;
  thread_id: string;
  stream_url: string;
}

export interface CreateThreadResult {
  thread_id: string;
  created: boolean;
}

export class Transport {
  constructor(private opts: TransportOptions) {
    this.opts = { ...opts, baseUrl: opts.baseUrl.replace(/\/+$/, "") };
  }

  setWidgetUserId(id: string) {
    this.opts.widgetUserId = id;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-widget-user-id": this.opts.widgetUserId,
      ...(extra ?? {}),
    };
  }

  private url(path: string): string {
    return `${this.opts.baseUrl}/api/widget/v1/${this.opts.widgetToken}${path}`;
  }

  async fetchConfig(): Promise<ServerConfig> {
    const res = await fetch(this.url("/config"), { headers: this.headers() });
    if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
    return res.json();
  }

  /**
   * List threads for the current visitor. Server filters by
   * `(widget_id, X-Widget-User-Id)` — without the header we'd receive a
   * 400 — so the result is always scoped to this user.
   */
  async listThreads(): Promise<ThreadSummary[]> {
    const res = await fetch(this.url("/threads"), { headers: this.headers() });
    if (!res.ok) throw new Error(`list threads failed: ${res.status}`);
    return res.json();
  }

  async createOrResumeThread(
    body: {
      force_new?: boolean;
      title?: string;
      vars?: Record<string, unknown> | null;
    } = {},
  ): Promise<CreateThreadResult> {
    const res = await fetch(this.url("/threads"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`create thread failed: ${res.status}`);
    return res.json();
  }

  /**
   * Replace the per-thread `widget_vars` JSONB. `null` clears it.
   * Server validates the value is a JSON object (or null) and that the
   * thread belongs to this `(widget, widget_user_id)` pair.
   */
  async updateThreadVars(
    threadId: string,
    vars: Record<string, unknown> | null,
  ): Promise<void> {
    const res = await fetch(this.url(`/threads/${threadId}`), {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ vars }),
    });
    if (!res.ok) throw new Error(`patch thread vars failed: ${res.status}`);
  }

  async listMessages(threadId: string): Promise<ServerMessage[]> {
    const res = await fetch(this.url(`/threads/${threadId}/messages`), {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`list messages failed: ${res.status}`);
    return res.json();
  }

  async sendMessage(
    threadId: string,
    content: string,
    attachments?: WidgetAttachment[],
  ): Promise<SendMessageResult> {
    const body: { content: string; attachments?: WidgetAttachment[] } = { content };
    if (attachments && attachments.length > 0) body.attachments = attachments;
    const res = await fetch(this.url(`/threads/${threadId}/messages`), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`send failed: ${res.status}`);
    return res.json();
  }

  /**
   * Upload a file under the current visitor's scope. The returned
   * descriptor is opaque — pass it through verbatim to the next
   * `sendMessage` call. The server re-validates the bucket_path on
   * send so a tampered value is rejected.
   */
  async uploadAttachment(file: File): Promise<WidgetAttachment> {
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await fetch(this.url(`/attachments/upload`), {
      method: "POST",
      // Don't set content-type — the browser fills in the multipart
      // boundary. The x-widget-user-id header is still required.
      headers: { "x-widget-user-id": this.opts.widgetUserId },
      body: form,
    });
    if (!res.ok) {
      let detail = "";
      try { detail = `: ${await res.text()}`; } catch { /* ignore */ }
      throw new Error(`upload failed: ${res.status}${detail}`);
    }
    return res.json();
  }

  /**
   * Fetch a stored attachment as a Blob. We can't use `<img src=...>`
   * or `<a href=...>` directly because the request needs the
   * X-Widget-User-Id header — the path-embedded widget token is not
   * sufficient on its own (it'd let any visitor of the same widget
   * read any other visitor's files). The caller should use the
   * returned blob via `URL.createObjectURL`.
   */
  async fetchAttachment(messageId: string, attachmentId: string): Promise<Blob> {
    const res = await fetch(
      this.url(`/attachments/${messageId}/${attachmentId}`),
      { headers: { "x-widget-user-id": this.opts.widgetUserId } },
    );
    if (!res.ok) throw new Error(`attachment fetch failed: ${res.status}`);
    return res.blob();
  }

  /**
   * Open a Server-Sent Events stream for the given assistant message.
   * The handler receives parsed event payloads. The returned function
   * tears down the EventSource.
   *
   * NOTE: EventSource doesn't support custom headers; the path-embedded
   * widget token is the auth carrier. The X-Widget-User-Id is supplied
   * by the prior send call which already established thread ownership.
   */
  streamMessage(
    messageId: string,
    handlers: StreamHandlers,
  ): () => void {
    // Built locally (the server's `stream_url` is ignored) so the
    // configured baseUrl always wins even if the server returns a
    // relative path.
    const path = `/api/widget/v1/${this.opts.widgetToken}/messages/${messageId}/stream`;
    const url = `${this.opts.baseUrl}${path}`;
    const es = new EventSource(url, { withCredentials: false });

    es.addEventListener("message", (e) => handlers.onChunk?.(e.data));
    es.addEventListener("reasoning", (e) =>
      handlers.onReasoning?.((e as MessageEvent).data),
    );
    // Tool-call lifecycle. Payloads are minimal — `{id, fn_name}` on
    // start, `{id, ok}` on completion. Enough for a status pill; the
    // full args/response stay on the authenticated thread-events
    // channel which the widget doesn't subscribe to.
    es.addEventListener("tool_call_started", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { id: string; fn_name: string };
        handlers.onToolCallStarted?.(data);
      } catch { /* ignore malformed */ }
    });
    es.addEventListener("tool_call_completed", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as { id: string; ok: boolean };
        handlers.onToolCallCompleted?.(data);
      } catch { /* ignore malformed */ }
    });
    // uraiJS `sendCommand` relay — the payload is the developer's JSON,
    // verbatim. Forwarded to the host page, never rendered.
    es.addEventListener("command", (e) => {
      try {
        handlers.onCommand?.(JSON.parse((e as MessageEvent).data));
      } catch {
        // malformed command payload — ignore
      }
    });
    // The "complete" event is the authoritative end-of-turn signal — it
    // carries the finalised assistant message. The server also fires a
    // separate "done" event right after, but per the HTML5 SSE spec an
    // event with empty data is silently dropped, so we treat "complete"
    // itself as terminal and use "done" only as a belt-and-braces
    // backup.
    let ended = false;
    const endStream = () => {
      if (ended) return;
      ended = true;
      es.close();
      handlers.onDone?.();
    };
    es.addEventListener("complete", (e) => {
      try {
        const msg = JSON.parse((e as MessageEvent).data) as ServerMessage;
        handlers.onComplete?.(msg);
      } catch {
        handlers.onComplete?.(null);
      }
      endStream();
    });
    es.addEventListener("done", () => {
      endStream();
    });
    es.addEventListener("error", (e) => {
      const data = (e as MessageEvent).data;
      // The "error" event fires both for our explicit error frames
      // (with data) and for transport errors (no data, readyState
      // CLOSED). Distinguish.
      if (typeof data === "string" && data.length > 0) {
        handlers.onError?.(data);
        es.close();
      } else if (es.readyState === EventSource.CLOSED) {
        handlers.onError?.("connection closed");
      }
    });

    return () => es.close();
  }
}

export interface StreamHandlers {
  onChunk?: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
  onCommand?: (command: unknown) => void;
  onToolCallStarted?: (call: { id: string; fn_name: string }) => void;
  onToolCallCompleted?: (call: { id: string; ok: boolean }) => void;
  onComplete?: (message: ServerMessage | null) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}
