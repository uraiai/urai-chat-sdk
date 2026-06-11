<script lang="ts">
  import { UraiChatWidget } from "@uraiai/chat-widget-svelte";

  const BASE_URL = import.meta.env.VITE_URAI_BASE_URL ?? "http://localhost:4545";
  const WIDGET_TOKEN = import.meta.env.VITE_URAI_WIDGET_TOKEN ?? "";
  const DEFAULT_USER = import.meta.env.VITE_URAI_USER_ID ?? "demo-user-1";

  let widget: UraiChatWidget;
  let userId = $state(DEFAULT_USER);
  let color = $state("#5b21b6");
  let plan = $state("free");
  let showInline = $state(false);
  let log = $state<string[]>([]);

  function addLog(line: string) {
    log = [...log.slice(-19), `${new Date().toLocaleTimeString()} ${line}`];
  }

  // Imperative setVars — updates the active thread's context (or buffers
  // for the next thread if none exists yet).
  function setVarsNow() {
    widget.getController()?.setVars({ plan, lastAction: "support-click" });
    addLog(`setVars: { plan: ${plan}, lastAction: support-click }`);
  }
</script>

<main style="font-family: system-ui; padding: 32px; max-width: 720px">
  <h1>Urai Chat — Svelte demo</h1>

  {#if !WIDGET_TOKEN}
    <p>
      Set <code>VITE_URAI_WIDGET_TOKEN</code> (and optionally
      <code>VITE_URAI_BASE_URL</code>) in <code>.env.local</code>, then restart.
      Remember to add <code>http://localhost:5175</code> to the widget's
      allowed origins.
    </p>
  {:else}
    <p>Floating widget is bottom-right. Server: <code>{BASE_URL}</code></p>

    <section style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px">
      <button onclick={() => widget.getController()?.open()}>Open</button>
      <button onclick={() => widget.getController()?.close()}>Close</button>
      <button
        onclick={() => widget.getController()?.sendMessage("Hello from the host page!")}
      >
        Send message
      </button>
      <button
        onclick={() => widget.getController()?.startConversation({ page: "svelte-demo" })}
      >
        New conversation
      </button>
      <button onclick={setVarsNow}>Set vars now</button>
      <label>
        Plan
        <select bind:value={plan}>
          <option value="free">free</option>
          <option value="pro">pro</option>
          <option value="enterprise">enterprise</option>
        </select>
      </label>
      <label>Theme color <input type="color" bind:value={color} /></label>
      <label>
        User
        <select bind:value={userId}>
          <option value={DEFAULT_USER}>{DEFAULT_USER}</option>
          <option value="demo-user-2">demo-user-2</option>
        </select>
      </label>
      <label>
        <input type="checkbox" bind:checked={showInline} /> Show inline widget
      </label>
    </section>

    <UraiChatWidget
      bind:this={widget}
      widgetToken={WIDGET_TOKEN}
      {userId}
      baseUrl={BASE_URL}
      theme={{ primaryColor: color }}
      vars={{ page: "svelte-demo", plan }}
      onready={() => addLog("ready")}
      onopened={() => addLog("opened")}
      onclosed={() => addLog("closed")}
      onusermessage={(c) => addLog(`user-message: ${c}`)}
      onassistantreply={(c) => addLog(`assistant-reply: ${c.slice(0, 60)}…`)}
      onerror={(e) => addLog(`error: ${e}`)}
    />

    {#if showInline}
      <section style="margin-bottom: 16px">
        <h2>Inline widget (second instance)</h2>
        <div style="height: 480px; border: 1px solid #ddd; border-radius: 12px">
          <UraiChatWidget
            widgetToken={WIDGET_TOKEN}
            {userId}
            baseUrl={BASE_URL}
            mode="inline"
          />
        </div>
      </section>
    {/if}

    <section>
      <h2>Event log</h2>
      <pre style="background: #f6f6f6; padding: 12px; min-height: 120px">{log.join(
          "\n",
        ) || "(no events yet)"}</pre>
    </section>
  {/if}
</main>
