import { useEffect, useRef, useState } from "react";
import {
  UraiChat,
  DefaultHeader,
  DefaultSendButton,
  type DisplayComponentProps,
  type UraiChatDisplayComponents,
  type UraiChatHandle,
} from "@uraiai/chat-widget-react/ui";

/**
 * A harness for the modular inline chat.
 *
 * The point of this app is not to look like a product — it is to make
 * every seam observable: what `vars` the server actually received, when
 * identity changed, which parts are overridden, and whether the widget
 * follows the host's dark mode.
 *
 * Point it at a running chat-service and add this origin
 * (http://localhost:5178) to the widget's allowed origins, or every
 * request 403s at the allowlist.
 */

const BASE_URL = import.meta.env.VITE_URAI_BASE_URL ?? "http://localhost:5174";
const WIDGET_TOKEN =
  import.meta.env.VITE_URAI_WIDGET_TOKEN ??
  "5483cb41-52ca-450e-849b-8a3396f1ebde"

/** Stand-ins for pages of a host app, each with its own context. */
const ROUTES = [
  { path: "/pricing", vars: { page: "/pricing", plan: "free", intent: "evaluate" } },
  { path: "/checkout", vars: { page: "/checkout", plan: "pro", intent: "purchase" } },
  { path: "/support", vars: { page: "/support", plan: "pro", intent: "help" } },
] as const;

type Skin = "default" | "branded" | "unstyled";

/**
 * Stands in for the host app's database: the thread ids this demo saw
 * created, with the visitor who owns each. A real host stores these
 * server-side against its own user.
 */
interface SavedThread {
  userId: string;
  threadId: string;
}
const SAVED_KEY = "react-ui-demo:saved-threads";

function loadSaved(): SavedThread[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as SavedThread[];
  } catch {
    return [];
  }
}

/**
 * A component a tool can put in the reply. The host owns it entirely — the
 * chat only ever learns its *name* and a JSON object, which is the whole
 * security story: nothing crosses that is executable.
 *
 * A tool asks for it with:
 *
 *   await meta.urai.sendCommand(meta.vars.thread_id, {
 *     command: "displayComponent",
 *     component: "OrderCard",
 *     props: { orderId: "o-1", status: "shipped", total: "$42.00" },
 *   });
 *
 * `props` is tool output, so the type below is a claim rather than a check —
 * read defensively, exactly as this does.
 */
function OrderCard({ props, sendMessage }: DisplayComponentProps) {
  const orderId = typeof props.orderId === "string" ? props.orderId : "unknown";
  const status = typeof props.status === "string" ? props.status : "pending";
  const total = typeof props.total === "string" ? props.total : null;

  return (
    <div className="demo-order-card">
      <div className="demo-order-head">
        <strong>Order {orderId}</strong>
        <span className={`demo-order-status is-${status}`}>{status}</span>
      </div>
      {total && <div className="demo-order-total">{total}</div>}
      {/* The visitor replying through the component is the point of
          `sendMessage` — the conversation continues rather than forking off
          into the host app. */}
      <button onClick={() => sendMessage(`Where is order ${orderId}?`)}>
        Track this order
      </button>
    </div>
  );
}

/**
 * A component that throws, to show the boundary doing its job: it takes
 * itself out of the transcript and leaves the conversation standing.
 */
function BrokenCard(): never {
  throw new Error("BrokenCard blew up on purpose");
}

const DISPLAY_COMPONENTS: UraiChatDisplayComponents = {
  OrderCard,
  BrokenCard,
};

export function App() {
  const chat = useRef<UraiChatHandle>(null);
  const [route, setRoute] = useState<(typeof ROUTES)[number]>(ROUTES[0]);
  const [userId, setUserId] = useState("visitor-1");
  const [skin, setSkin] = useState<Skin>("default");
  const [dark, setDark] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [saved, setSaved] = useState<SavedThread[]>(loadSaved);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<SavedThread | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch {
      // Storage disabled: the list just won't survive a reload.
    }
  }, [saved]);

  // Titles come from the server — it names a thread after the first reply,
  // so they are read at display time rather than saved with the id. The
  // live chat's handle is scoped to the current visitor, so only their
  // threads resolve.
  useEffect(() => {
    let cancelled = false;
    for (const t of saved) {
      if (t.userId !== userId || titles[t.threadId]) continue;
      void chat.current?.getThreadSummary(t.threadId).then((summary) => {
        if (!cancelled && summary) {
          setTitles((all) => ({ ...all, [t.threadId]: summary.title }));
        }
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, userId]);

  const note = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 60));

  // The host owns dark mode. `color-scheme` on the ancestor is the whole
  // bridge — the widget defaults to following it, with no JS.
  useEffect(() => {
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    document.documentElement.dataset.hostTheme = dark ? "dark" : "light";
  }, [dark]);

  return (
    <div className="page">
      <aside className="panel">
        <h1>Urai chat — modular UI</h1>
        <p className="hint">
          Token <code>{WIDGET_TOKEN.slice(0, 8)}…</code> against <code>{BASE_URL}</code>.
          Allowlist <code>http://localhost:5178</code> on the widget first.
        </p>

        <section>
          <h2>vars — the context the assistant sees</h2>
          <p className="hint">
            Changing the route changes the <code>vars</code> prop. The widget is
            not remounted; an existing thread is PATCHed, and a thread created
            later carries the new values.
          </p>
          <div className="row">
            {ROUTES.map((r) => (
              <button
                key={r.path}
                className={r.path === route.path ? "on" : undefined}
                onClick={() => {
                  setRoute(r);
                  note(`vars prop → ${JSON.stringify(r.vars)}`);
                }}
              >
                {r.path}
              </button>
            ))}
          </div>
          <pre className="vars">{JSON.stringify(route.vars, null, 2)}</pre>

          <div className="row">
            <button
              onClick={() => {
                const vars = { ...route.vars, escalated: true, at: Date.now() };
                chat.current?.setVars(vars);
                note(`ref.setVars(${JSON.stringify(vars)})`);
              }}
            >
              ref.setVars(…)
            </button>
            <button
              onClick={() => {
                chat.current?.startConversation({ ...route.vars, restarted: true });
                note("ref.startConversation(vars) — lazy, no request until you send");
              }}
            >
              startConversation(vars)
            </button>
          </div>
        </section>

        <section>
          <h2>Identity</h2>
          <p className="hint">
            Switching visitor clears the transcript and re-scopes the transport
            — without tearing down the widget.
          </p>
          <div className="row">
            {["visitor-1", "visitor-2"].map((id) => (
              <button
                key={id}
                className={id === userId ? "on" : undefined}
                onClick={() => {
                  setUserId(id);
                  note(`userId prop → ${id}`);
                }}
              >
                {id}
              </button>
            ))}
            <button
              onClick={() => {
                chat.current?.setUser({ id: "visitor-3", vars: route.vars });
                note("ref.setUser({ id: 'visitor-3', vars })");
              }}
            >
              ref.setUser(+vars)
            </button>
          </div>
        </section>

        <section>
          <h2>Presentation</h2>
          <div className="row">
            {(["default", "branded", "unstyled"] as Skin[]).map((s) => (
              <button
                key={s}
                className={s === skin ? "on" : undefined}
                onClick={() => setSkin(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="row">
            <label>
              <input
                type="checkbox"
                checked={dark}
                onChange={(e) => setDark(e.target.checked)}
              />
              host dark mode
            </label>
          </div>
        </section>

        <section>
          <h2>Display components</h2>
          <p className="hint">
            A uraiJS tool can put host UI in the reply by sending{" "}
            <code>{'{ command: "displayComponent", component, props }'}</code>.
            Registered here: <code>OrderCard</code> (renders) and{" "}
            <code>BrokenCard</code> (throws, to show the error boundary). A name
            with no entry renders nothing and warns once.
          </p>
          <p className="hint">
            There is no host-side way to fake one — the command has to come from
            a tool. <code>agent/SYSTEM_PROMPT.md</code> is an assistant that
            does nothing but this: paste it in, ask about order{" "}
            <code>o-1042</code>, then reload. The card comes back, because
            chat-service persists it against the message.
          </p>
        </section>

        <section>
          <h2>Saved conversations</h2>
          <p className="hint">
            <code>onThreadChange</code> with reason <code>created</code> saves
            each new thread id here (localStorage, standing in for your
            database). Open one to see it read-only beside the live chat — the
            viewer passes the thread owner's <code>userId</code>, and never
            moves the live chat's own saved thread.
          </p>
          {saved.length === 0 ? (
            <p className="hint">None yet — send a message.</p>
          ) : (
            <ul className="saved">
              {saved.map((t) => (
                <li key={t.threadId}>
                  <button
                    className={viewing?.threadId === t.threadId ? "on" : undefined}
                    onClick={() => {
                      setViewing(t);
                      note(`viewing ${t.threadId} read-only`);
                    }}
                  >
                    {titles[t.threadId] ?? t.threadId.slice(0, 8) + "…"}
                  </button>
                  <span className="hint">{t.userId}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            <button onClick={() => setSaved([])} disabled={saved.length === 0}>
              forget all
            </button>
            <button
              onClick={() => {
                const id = crypto.randomUUID();
                setViewing({ userId, threadId: id });
                note(`viewing ${id} — not this visitor's, expect "unavailable"`);
              }}
            >
              open a foreign id
            </button>
          </div>
        </section>

        <section>
          <h2>Other actions</h2>
          <div className="row">
            <button onClick={() => chat.current?.sendMessage("What can you do?")}>
              sendMessage()
            </button>
            <button
              onClick={() => {
                chat.current?.newConversation();
                note("ref.newConversation()");
              }}
            >
              newConversation()
            </button>
            <button
              onClick={() => note(JSON.stringify(summarize(chat.current), null, 2))}
            >
              getState()
            </button>
          </div>
        </section>

        <section>
          <h2>Events</h2>
          <button onClick={() => setLog([])}>clear</button>
          <pre className="log">{log.join("\n") || "…"}</pre>
        </section>
      </aside>

      <main className="stage">
        {blocked && (
          <div className="blocked" role="alert">
            <strong>This origin is not allowed for that widget.</strong>
            <span>
              Add <code>{window.location.origin}</code> to the widget's allowed
              origins (Security tab in the widget designer), then reload.
            </span>
          </div>
        )}
        <div className="frames">
        <div className="frame">
          <UraiChat
            ref={chat}
            baseUrl={BASE_URL}
            widgetToken={WIDGET_TOKEN}
            userId={userId}
            vars={route.vars}
            {...skinProps(skin)}
            onReady={() => note("ready")}
            onUserMessage={(c) => note(`user-message: ${c.slice(0, 60)}`)}
            onAssistantReply={(c) => note(`assistant-reply: ${c.length} chars`)}
            displayComponents={DISPLAY_COMPONENTS}
            onThreadChange={(threadId, { reason }) => {
              note(`thread-change: ${threadId ?? "null"} (${reason})`);
              if (reason === "created" && threadId) {
                setSaved((all) => [{ userId, threadId }, ...all]);
              }
            }}
            onCommand={(c) => note(`command: ${JSON.stringify(c)}`)}
            onError={(e) => {
              note(`error: ${e}`);
              // The widget is gated on (token, Origin ∈ allowed_origins),
              // and a missing origin is by far the most common setup
              // failure — say so instead of showing an empty panel.
              if (/403|origin/i.test(e)) setBlocked(true);
            }}
          />
        </div>
        {viewing && (
          <div className="frame viewer">
            <div className="viewer-bar">
              <span>
                Read-only · <code>{viewing.threadId.slice(0, 8)}…</code> as{" "}
                <code>{viewing.userId}</code>
              </span>
              <button onClick={() => setViewing(null)}>close</button>
            </div>
            <UraiChat
              baseUrl={BASE_URL}
              widgetToken={WIDGET_TOKEN}
              userId={viewing.userId}
              // Changing it loads the next thread in place — clicking
              // another saved conversation does not remount the viewer.
              threadId={viewing.threadId}
              readOnly
              displayComponents={DISPLAY_COMPONENTS}
              onError={(e) => note(`viewer error: ${e}`)}
            />
          </div>
        )}
        </div>
      </main>
    </div>
  );
}

function summarize(handle: UraiChatHandle | null) {
  const s = handle?.getState();
  if (!s) return { state: "not mounted" };
  return {
    threadId: s.threadId,
    userId: s.userId,
    vars: s.vars,
    status: s.status,
    messages: s.messages.length,
    streaming: s.stream !== null,
  };
}

/**
 * The three levels of customization, side by side:
 *   default  — ship as-is
 *   branded  — swap two parts, tweak a token, append a class
 *   unstyled — drop every default class and bring your own CSS
 */
function skinProps(skin: Skin) {
  if (skin === "branded") {
    return {
      theme: { primaryColor: "#0f766e", radius: "20px" },
      labels: { placeholder: "Ask the Acme team…", send: "Send it" },
      classNames: { composer: "demo-composer" },
      components: {
        Header: (p: React.ComponentProps<typeof DefaultHeader>) => (
          <div className="demo-header-wrap">
            <DefaultHeader {...p} title="Acme Support" />
          </div>
        ),
        SendButton: (p: React.ComponentProps<typeof DefaultSendButton>) => (
          <DefaultSendButton {...p} />
        ),
        EmptyState: () => (
          <div className="demo-empty">
            <strong>How can we help?</strong>
            <span>Ask about billing, shipping or your account.</span>
          </div>
        ),
      },
    } as const;
  }
  if (skin === "unstyled") {
    return {
      unstyled: true,
      classNames: {
        root: "u-root",
        header: "u-header",
        viewport: "u-viewport",
        messageList: "u-list",
        userMessage: "u-msg u-msg-user",
        assistantMessage: "u-msg u-msg-assistant",
        composer: "u-composer",
        composerInput: "u-input",
        sendButton: "u-send",
      },
    } as const;
  }
  return {} as const;
}
