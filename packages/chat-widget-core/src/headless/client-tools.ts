/**
 * Client tools: tools the host app declares and runs itself.
 *
 * The host passes `clientTools` with a name, description, JSON Schema and
 * handler per tool. Every send carries the declarations (never the
 * handlers) as the message's `client` hello, and the agent may then call
 * them. A call arrives on the turn's stream as `client_tool_call`; the
 * runner claims it, optionally asks the host's `approve`, runs the handler
 * and posts the result back.
 *
 * Claim before run is the rule that makes this safe: the server lets exactly
 * one claim win, so a replayed event after a reconnect, or the same chat
 * open in a second tab, never runs a call twice.
 *
 * This is a separate path from `sendCommand` / `displayComponent`, which are
 * one-way: a command is something the agent shows, a client tool is
 * something the agent asks the host to do and waits for.
 *
 * The widget must have "Allow tools declared by the embedding page" turned
 * on (`client_tools = "declared"`), and the assistant must run in agent
 * mode; otherwise the declarations are ignored and no call ever arrives.
 */

export type ClientToolEffect = "read" | "write";

/** A call as it arrives from the server. */
export interface ClientToolCall {
  /** The server's tool-call id; also what claim and result address. */
  id: string;
  tool: string;
  args: unknown;
  effect: ClientToolEffect;
}

export interface ClientToolContext {
  callId: string;
  threadId: string;
  effect: ClientToolEffect;
  /** Aborted when the chat is stopped or destroyed while the call runs. */
  signal: AbortSignal;
}

export interface ClientToolDeclaration {
  /** Lowercase letters, digits and `_`, starting with a letter; at most 48. */
  name: string;
  /** What the tool does, written for the model. Required. */
  description: string;
  /** JSON Schema for the arguments; must be `{ "type": "object", … }`. */
  parameters?: Record<string, unknown>;
  /** `write` (the default) is what `approve` is asked about. */
  effect?: ClientToolEffect;
  /** Runs the call. The return value must be JSON-serialisable. */
  handler: (args: unknown, ctx: ClientToolContext) => unknown | Promise<unknown>;
}

export type ClientToolApproval = { ok: true } | { ok: false; note?: string };

export interface ClientToolsOptions {
  /** A short label for your app, shown to the model ("custom" by default). */
  host?: string;
  tools: ClientToolDeclaration[];
  /**
   * Built-in tool families this host implements, e.g. `["document@1"]`. For
   * Urai's own add-ons (member hosts) only: the server supplies the family's
   * declarations, so its tools (`doc_read`, `doc_edit`, …) are listed in
   * `tools` for their handlers but never sent as declarations. A widget's
   * families are ignored by the server.
   */
  families?: string[];
  /**
   * Opt-in review before each `write` call runs.
   *
   * - `"inline"`: the chat shows an Allow / Decline card in the reply.
   * - A function: your own UI. Resolve `{ ok: false, note }` to decline; the
   *   agent is told the user said no.
   */
  approve?:
    | "inline"
    | ((call: ClientToolCall) => ClientToolApproval | Promise<ClientToolApproval>);
}

/** A `write` call waiting on the inline approval card. */
export interface PendingApproval extends ClientToolCall {
  /** The declaration's description, so the card can say what the tool does. */
  description: string;
  /** The `host` label the app declared. */
  host: string;
}

/** How an engine shows the inline card and waits for the answer. */
export type InlineApprover = (pending: PendingApproval) => Promise<ClientToolApproval>;

/** The `client` object sent with each message. */
export interface ClientHelloWire {
  host: string;
  families?: string[];
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    effect: ClientToolEffect;
  }>;
}

/** Name prefixes of Urai's built-in families; the server owns those declarations. */
export const FAMILY_TOOL_PREFIXES = ["doc_", "sheet_", "slide_", "browser_"] as const;

function isFamilyTool(name: string): boolean {
  return FAMILY_TOOL_PREFIXES.some((p) => name.startsWith(p));
}

export function clientHello(opts: ClientToolsOptions | null | undefined): ClientHelloWire | null {
  if (!opts || opts.tools.length === 0) return null;
  const families = opts.families?.length ? [...opts.families] : undefined;
  return {
    host: opts.host ?? "custom",
    ...(families ? { families } : {}),
    tools: opts.tools.filter((t) => !isFamilyTool(t.name)).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters ?? { type: "object", properties: {} },
      effect: t.effect ?? "write",
    })),
  };
}

/** The result body posted back to the server. */
export interface ClientToolResultWire {
  instance: string;
  status: "ok" | "error" | "rejected";
  value?: unknown;
  error?: string;
}

/** What the runner needs from a transport. */
export interface ClientToolPort {
  /** `true` when this instance won the claim; `false` on a 409. */
  claimToolCall(callId: string, instance: string): Promise<boolean>;
  postToolCallResult(callId: string, body: ClientToolResultWire): Promise<boolean>;
}

/**
 * Client tools as an object, or a function returning the current ones. The
 * function form is what framework wrappers pass, so a re-render with new
 * handlers takes effect on the next send/call without remounting the chat.
 */
export type ClientToolsSource =
  | ClientToolsOptions
  | (() => ClientToolsOptions | null | undefined)
  | null
  | undefined;

export interface ClientToolRunner {
  /** The hello for the next send: read fresh from the source each time. */
  readonly hello: ClientHelloWire | null;
  /** Handle a `client_tool_call` event. Never throws. */
  handle(call: ClientToolCall, threadId: string): Promise<void>;
  /** Abort every running handler (stop / destroy). */
  abortAll(): void;
}

function newInstanceId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Make a thrown value or a returned value safe to post as JSON. */
function toJsonValue(v: unknown): unknown {
  if (v === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return String(v);
  }
}

export function createClientToolRunner(
  source: ClientToolsSource,
  port: Partial<ClientToolPort> | null,
  onError?: (message: string) => void,
  inlineApprove?: InlineApprover,
): ClientToolRunner {
  const instance = newInstanceId();
  const current = (): ClientToolsOptions | null =>
    (typeof source === "function" ? source() : source) ?? null;
  // Calls this instance has seen, so a replayed event is ignored without
  // even asking the server.
  const seen = new Set<string>();
  const running = new Map<string, AbortController>();

  async function handle(call: ClientToolCall, threadId: string): Promise<void> {
    const opts = current();
    const decl = opts?.tools.find((t) => t.name === call.tool);
    if (!decl || seen.has(call.id)) return;
    if (!port?.claimToolCall || !port.postToolCallResult) return;
    seen.add(call.id);

    let won = false;
    try {
      won = await port.claimToolCall(call.id, instance);
    } catch (e) {
      onError?.(`client tool claim failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    // Someone else has it (another tab, or this one before a reload). Never run.
    if (!won) return;

    const post = async (body: Omit<ClientToolResultWire, "instance">) => {
      try {
        await port.postToolCallResult!(call.id, { instance, ...body });
      } catch (e) {
        onError?.(`client tool result failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    if (call.effect === "write" && opts?.approve) {
      let approval: ClientToolApproval;
      try {
        if (opts.approve === "inline") {
          // An engine without an inline card refuses rather than running
          // unreviewed: the host asked for review.
          approval = inlineApprove
            ? await inlineApprove({
                ...call,
                description: decl.description,
                host: opts.host ?? "custom",
              })
            : { ok: false, note: "This chat cannot show an approval card." };
        } else {
          approval = await opts.approve(call);
        }
      } catch (e) {
        approval = { ok: false, note: e instanceof Error ? e.message : String(e) };
      }
      if (!approval.ok) {
        await post({ status: "rejected", error: approval.note });
        return;
      }
    }

    const controller = new AbortController();
    running.set(call.id, controller);
    try {
      const value = await decl.handler(call.args, {
        callId: call.id,
        threadId,
        effect: call.effect,
        signal: controller.signal,
      });
      await post({ status: "ok", value: toJsonValue(value) });
    } catch (e) {
      await post({ status: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      running.delete(call.id);
    }
  }

  return {
    get hello() {
      return clientHello(current());
    },
    handle,
    abortAll() {
      for (const c of running.values()) c.abort();
      running.clear();
    },
  };
}

/** Parse a `client_tool_call` event payload; `null` when malformed. */
export function parseClientToolCall(raw: unknown): ClientToolCall | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.tool !== "string") return null;
  return {
    id: r.id,
    tool: r.tool,
    args: r.args ?? {},
    effect: r.effect === "read" ? "read" : "write",
  };
}
