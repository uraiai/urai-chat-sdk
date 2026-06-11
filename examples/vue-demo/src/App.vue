<script setup lang="ts">
import { ref } from "vue";
import { UraiChatWidget, type WidgetController } from "@uraiai/chat-widget-vue";

const BASE_URL = import.meta.env.VITE_URAI_BASE_URL ?? "http://localhost:4545";
const WIDGET_TOKEN = import.meta.env.VITE_URAI_WIDGET_TOKEN ?? "";
const DEFAULT_USER = import.meta.env.VITE_URAI_USER_ID ?? "demo-user-1";

const widgetRef = ref<{ controller: WidgetController | null } | null>(null);
const userId = ref(DEFAULT_USER);
const color = ref("#5b21b6");
const plan = ref("free");
const showInline = ref(false);
const log = ref<string[]>([]);

function addLog(line: string) {
  log.value = [...log.value.slice(-19), `${new Date().toLocaleTimeString()} ${line}`];
}

function controller(): WidgetController | null {
  return widgetRef.value?.controller ?? null;
}

// Imperative setVars — updates the active thread's context (or buffers
// for the next thread if none exists yet).
function setVarsNow() {
  controller()?.setVars({ plan: plan.value, lastAction: "support-click" });
  addLog(`setVars: { plan: ${plan.value}, lastAction: support-click }`);
}
</script>

<template>
  <main style="font-family: system-ui; padding: 32px; max-width: 720px">
    <h1>Urai Chat — Vue demo</h1>
    <template v-if="!WIDGET_TOKEN">
      <p>
        Set <code>VITE_URAI_WIDGET_TOKEN</code> (and optionally
        <code>VITE_URAI_BASE_URL</code>) in <code>.env.local</code>, then
        restart. Remember to add <code>http://localhost:5174</code> to the
        widget's allowed origins.
      </p>
    </template>
    <template v-else>
      <p>
        Floating widget is bottom-right. Server: <code>{{ BASE_URL }}</code>
      </p>

      <section style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px">
        <button @click="controller()?.open()">Open</button>
        <button @click="controller()?.close()">Close</button>
        <button @click="controller()?.sendMessage('Hello from the host page!')">
          Send message
        </button>
        <button @click="controller()?.startConversation({ page: 'vue-demo' })">
          New conversation
        </button>
        <button @click="setVarsNow">Set vars now</button>
        <label>
          Plan
          <select v-model="plan">
            <option value="free">free</option>
            <option value="pro">pro</option>
            <option value="enterprise">enterprise</option>
          </select>
        </label>
        <label>Theme color <input type="color" v-model="color" /></label>
        <label>
          User
          <select v-model="userId">
            <option :value="DEFAULT_USER">{{ DEFAULT_USER }}</option>
            <option value="demo-user-2">demo-user-2</option>
          </select>
        </label>
        <label>
          <input type="checkbox" v-model="showInline" /> Show inline widget
        </label>
      </section>

      <UraiChatWidget
        ref="widgetRef"
        :widget-token="WIDGET_TOKEN"
        :user-id="userId"
        :base-url="BASE_URL"
        :theme="{ primaryColor: color }"
        :vars="{ page: 'vue-demo', plan }"
        @ready="addLog('ready')"
        @opened="addLog('opened')"
        @closed="addLog('closed')"
        @user-message="(c: string) => addLog(`user-message: ${c}`)"
        @assistant-reply="(c: string) => addLog(`assistant-reply: ${c.slice(0, 60)}…`)"
        @error="(e: string) => addLog(`error: ${e}`)"
      />

      <section v-if="showInline" style="margin-bottom: 16px">
        <h2>Inline widget (second instance)</h2>
        <div style="height: 480px; border: 1px solid #ddd; border-radius: 12px">
          <UraiChatWidget
            :widget-token="WIDGET_TOKEN"
            :user-id="userId"
            :base-url="BASE_URL"
            mode="inline"
          />
        </div>
      </section>

      <section>
        <h2>Event log</h2>
        <pre style="background: #f6f6f6; padding: 12px; min-height: 120px">{{
          log.join("\n") || "(no events yet)"
        }}</pre>
      </section>
    </template>
  </main>
</template>
