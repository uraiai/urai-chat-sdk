import { useRef, useState } from "react";
import {
  UraiChatWidget,
  type WidgetController,
} from "@uraiai/chat-widget-react";

const BASE_URL = import.meta.env.VITE_URAI_BASE_URL ?? "http://localhost:4545";
const WIDGET_TOKEN = import.meta.env.VITE_URAI_WIDGET_TOKEN ?? "";
const DEFAULT_USER = import.meta.env.VITE_URAI_USER_ID ?? "demo-user-1";

export function App() {
  const controller = useRef<WidgetController>(null);
  const [userId, setUserId] = useState(DEFAULT_USER);
  const [color, setColor] = useState("#5b21b6");
  const [plan, setPlan] = useState("free");
  const [showInline, setShowInline] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (line: string) =>
    setLog((l) => [...l.slice(-19), `${new Date().toLocaleTimeString()} ${line}`]);

  if (!WIDGET_TOKEN) {
    return (
      <main style={{ fontFamily: "system-ui", padding: 32 }}>
        <h1>Urai Chat — React demo</h1>
        <p>
          Set <code>VITE_URAI_WIDGET_TOKEN</code> (and optionally{" "}
          <code>VITE_URAI_BASE_URL</code>) in <code>.env.local</code>, then
          restart. Remember to add <code>http://localhost:5173</code> to the
          widget's allowed origins.
        </p>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 32, maxWidth: 720 }}>
      <h1>Urai Chat — React demo</h1>
      <p>
        Floating widget is bottom-right. Server: <code>{BASE_URL}</code>
      </p>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={() => controller.current?.open()}>Open</button>
        <button onClick={() => controller.current?.close()}>Close</button>
        <button onClick={() => controller.current?.sendMessage("Hello from the host page!")}>
          Send message
        </button>
        <button
          onClick={() =>
            controller.current?.startConversation({ page: location.pathname })
          }
        >
          New conversation
        </button>
        <button
          onClick={() => {
            // Imperative setVars — updates the active thread's context
            // (or buffers for the next thread if none exists yet).
            controller.current?.setVars({ plan, lastAction: "support-click" });
            addLog(`setVars: { plan: ${plan}, lastAction: support-click }`);
          }}
        >
          Set vars now
        </button>
        <label>
          Plan{" "}
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="free">free</option>
            <option value="pro">pro</option>
            <option value="enterprise">enterprise</option>
          </select>
        </label>
        <label>
          Theme color{" "}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <label>
          User{" "}
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value={DEFAULT_USER}>{DEFAULT_USER}</option>
            <option value="demo-user-2">demo-user-2</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={showInline}
            onChange={(e) => setShowInline(e.target.checked)}
          />{" "}
          Show inline widget
        </label>
      </section>

      <UraiChatWidget
        ref={controller}
        widgetToken={WIDGET_TOKEN}
        userId={userId}
        baseUrl={BASE_URL}
        theme={{ primaryColor: color }}
        // Changing the vars prop calls setVars() on the active thread —
        // switch the Plan dropdown above to see it in action.
        vars={{ page: "react-demo", plan }}
        onReady={() => addLog("ready")}
        onOpened={() => addLog("opened")}
        onClosed={() => addLog("closed")}
        onUserMessage={(c) => addLog(`user-message: ${c}`)}
        onAssistantReply={(c) => addLog(`assistant-reply: ${c.slice(0, 60)}…`)}
        onCommand={(cmd) => addLog(`command: ${JSON.stringify(cmd)}`)}
        onError={(e) => addLog(`error: ${e}`)}
      />

      {showInline && (
        <section style={{ marginBottom: 16 }}>
          <h2>Inline widget (second instance)</h2>
          <UraiChatWidget
            widgetToken={WIDGET_TOKEN}
            userId={userId}
            baseUrl={BASE_URL}
            mode="inline"
            style={{ height: 480, border: "1px solid #ddd", borderRadius: 12 }}
          />
        </section>
      )}

      <section>
        <h2>Event log</h2>
        <pre style={{ background: "#f6f6f6", padding: 12, minHeight: 120 }}>
          {log.join("\n") || "(no events yet)"}
        </pre>
      </section>
    </main>
  );
}
