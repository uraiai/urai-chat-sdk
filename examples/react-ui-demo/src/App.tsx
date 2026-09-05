import { useEffect, useRef, useState } from "react";
import {
  UraiChat,
  DefaultHeader,
  DefaultSendButton,
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
  "cc517efd-a93b-46ff-a82c-e5cc2fb161ef";

/** Stand-ins for pages of a host app, each with its own context. */
const ROUTES = [
  { path: "/pricing", vars: { page: "/pricing", plan: "free", intent: "evaluate" } },
  { path: "/checkout", vars: { page: "/checkout", plan: "pro", intent: "purchase" } },
  { path: "/support", vars: { page: "/support", plan: "pro", intent: "help" } },
] as const;

type Skin = "default" | "branded" | "unstyled";

export function App() {
  const chat = useRef<UraiChatHandle>(null);
  const [route, setRoute] = useState<(typeof ROUTES)[number]>(ROUTES[0]);
  const [userId, setUserId] = useState("visitor-1");
  const [skin, setSkin] = useState<Skin>("default");
  const [dark, setDark] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);

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
