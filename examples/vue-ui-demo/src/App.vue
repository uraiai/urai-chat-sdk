<script setup lang="ts">
import { computed, h, markRaw, ref, watch, watchEffect, type FunctionalComponent } from "vue";
import {
  UraiChat,
  DefaultHeader,
  type HeaderSlotProps,
  type ThreadChangeInfo,
  type UraiChatDisplayComponents,
  type UraiChatHandle,
} from "@uraiai/chat-widget-vue/ui";
import OrderCard from "./OrderCard.vue";
import { BrokenCard } from "./BrokenCard";

/**
 * A harness for the modular inline chat — the Vue twin of react-ui-demo.
 *
 * The point of this app is not to look like a product — it is to make every
 * seam observable: what `vars` the server actually received, when identity
 * changed, which parts are overridden, and whether the widget follows the
 * host's dark mode.
 *
 * Point it at a running chat-service and add this origin
 * (http://localhost:5179) to the widget's allowed origins, or every request
 * 403s at the allowlist.
 */

const BASE_URL = import.meta.env.VITE_URAI_BASE_URL ?? "http://localhost:5174";
const WIDGET_TOKEN =
  import.meta.env.VITE_URAI_WIDGET_TOKEN ?? "5483cb41-52ca-450e-849b-8a3396f1ebde";
const ORIGIN = window.location.origin;

/** Stand-ins for pages of a host app, each with its own context. */
const ROUTES = [
  { path: "/pricing", vars: { page: "/pricing", plan: "free", intent: "evaluate" } },
  { path: "/checkout", vars: { page: "/checkout", plan: "pro", intent: "purchase" } },
  { path: "/support", vars: { page: "/support", plan: "pro", intent: "help" } },
] as const;

type Skin = "default" | "branded" | "unstyled";

/**
 * Stands in for the host app's database: the thread ids this demo saw
 * created, with the visitor who owns each.
 */
interface SavedThread {
  userId: string;
  threadId: string;
}
const SAVED_KEY = "vue-ui-demo:saved-threads";

function loadSaved(): SavedThread[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as SavedThread[];
  } catch {
    return [];
  }
}

// markRaw: component definitions are not state, and keeping them out of
// Vue's reactivity avoids a warning and a proxy per render.
const DISPLAY_COMPONENTS: UraiChatDisplayComponents = markRaw({ OrderCard, BrokenCard });

const chat = ref<UraiChatHandle | null>(null);
const route = ref<(typeof ROUTES)[number]>(ROUTES[0]);
const userId = ref("visitor-1");
const skin = ref<Skin>("default");
const dark = ref(false);
const log = ref<string[]>([]);
const blocked = ref(false);
const saved = ref<SavedThread[]>(loadSaved());
const titles = ref<Record<string, string>>({});
const viewing = ref<SavedThread | null>(null);

watch(
  saved,
  (all) => {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(all));
    } catch {
      // Storage disabled: the list just won't survive a reload.
    }
  },
);

// Titles come from the server — it names a thread after the first reply, so
// they are read at display time rather than saved with the id.
watch(
  [saved, userId, chat],
  () => {
    for (const t of saved.value) {
      if (t.userId !== userId.value || titles.value[t.threadId]) continue;
      void chat.value?.getThreadSummary(t.threadId).then((summary) => {
        if (summary) titles.value = { ...titles.value, [t.threadId]: summary.title };
      });
    }
  },
  { immediate: true },
);

function note(line: string) {
  log.value = [`${new Date().toLocaleTimeString()}  ${line}`, ...log.value].slice(0, 60);
}

// The host owns dark mode. `color-scheme` on the ancestor is the whole
// bridge — the chat defaults to following it, with no JS.
watchEffect(() => {
  document.documentElement.style.colorScheme = dark.value ? "dark" : "light";
  document.documentElement.dataset.hostTheme = dark.value ? "dark" : "light";
});

function pickRoute(r: (typeof ROUTES)[number]) {
  route.value = r;
  note(`vars prop → ${JSON.stringify(r.vars)}`);
}

function setVarsNow() {
  const vars = { ...route.value.vars, escalated: true, at: Date.now() };
  chat.value?.setVars(vars);
  note(`ref.setVars(${JSON.stringify(vars)})`);
}

function restart() {
  chat.value?.startConversation({ ...route.value.vars, restarted: true });
  note("ref.startConversation(vars) — lazy, no request until you send");
}

function onThreadChange(threadId: string | null, { reason }: ThreadChangeInfo) {
  note(`thread-change: ${threadId ?? "null"} (${reason})`);
  if (reason === "created" && threadId) {
    saved.value = [{ userId: userId.value, threadId }, ...saved.value];
  }
}

function onError(e: string) {
  note(`error: ${e}`);
  // The widget is gated on (token, Origin ∈ allowed_origins), and a missing
  // origin is by far the most common setup failure — say so instead of
  // showing an empty panel.
  if (/403|origin/i.test(e)) blocked.value = true;
}

function openForeign() {
  const id = crypto.randomUUID();
  viewing.value = { userId: userId.value, threadId: id };
  note(`viewing ${id} — not this visitor's, expect "unavailable"`);
}

function summarize() {
  const s = chat.value?.getState();
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
 *   branded  — swap a part, tweak a token, append a class (and, in the
 *              template below, a named scoped slot for the empty state)
 *   unstyled — drop every default class and bring your own CSS
 */
const BrandedHeader: FunctionalComponent<HeaderSlotProps> = (p) =>
  h("div", { class: "demo-header-wrap" }, [h(DefaultHeader, { ...p, title: "Acme Support" })]);

const skinProps = computed(() => {
  if (skin.value === "branded") {
    return {
      theme: { primaryColor: "#0f766e", radius: "20px" },
      labels: { placeholder: "Ask the Acme team…", send: "Send it" },
      classNames: { composer: "demo-composer" },
      components: markRaw({ Header: BrandedHeader }),
    };
  }
  if (skin.value === "unstyled") {
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
    };
  }
  return {};
});
</script>

<template>
  <div class="page">
    <aside class="panel">
      <h1>Urai chat — modular UI (Vue)</h1>
      <p class="hint">
        Token <code>{{ WIDGET_TOKEN.slice(0, 8) }}…</code> against <code>{{ BASE_URL }}</code>.
        Allowlist <code>http://localhost:5179</code> on the widget first.
      </p>

      <section>
        <h2>vars — the context the assistant sees</h2>
        <p class="hint">
          Changing the route changes the <code>vars</code> prop. The chat is not remounted; an
          existing thread is PATCHed, and a thread created later carries the new values.
        </p>
        <div class="row">
          <button
            v-for="r in ROUTES"
            :key="r.path"
            :class="{ on: r.path === route.path }"
            @click="pickRoute(r)"
          >
            {{ r.path }}
          </button>
        </div>
        <pre class="vars">{{ JSON.stringify(route.vars, null, 2) }}</pre>
        <div class="row">
          <button @click="setVarsNow">ref.setVars(…)</button>
          <button @click="restart">startConversation(vars)</button>
        </div>
      </section>

      <section>
        <h2>Identity</h2>
        <p class="hint">
          Switching visitor clears the transcript and re-scopes the transport — without tearing
          down the chat.
        </p>
        <div class="row">
          <button
            v-for="id in ['visitor-1', 'visitor-2']"
            :key="id"
            :class="{ on: id === userId }"
            @click="
              userId = id;
              note(`userId prop → ${id}`);
            "
          >
            {{ id }}
          </button>
          <button
            @click="
              chat?.setUser({ id: 'visitor-3', vars: route.vars });
              note(`ref.setUser({ id: 'visitor-3', vars })`);
            "
          >
            ref.setUser(+vars)
          </button>
        </div>
      </section>

      <section>
        <h2>Presentation</h2>
        <div class="row">
          <button
            v-for="s in ['default', 'branded', 'unstyled'] as Skin[]"
            :key="s"
            :class="{ on: s === skin }"
            @click="skin = s"
          >
            {{ s }}
          </button>
        </div>
        <div class="row">
          <label><input v-model="dark" type="checkbox" /> host dark mode</label>
        </div>
      </section>

      <section>
        <h2>Display components</h2>
        <p class="hint">
          A uraiJS tool can put host UI in the reply by sending
          <code>{ command: "displayComponent", component, props }</code>. Registered here:
          <code>OrderCard</code> (an SFC, renders) and <code>BrokenCard</code> (throws, to show
          the error boundary). A name with no entry renders nothing and warns once.
        </p>
        <p class="hint">
          There is no host-side way to fake one — the command has to come from a tool.
          <code>examples/react-ui-demo/agent/SYSTEM_PROMPT.md</code> is an assistant that does
          nothing but this: paste it in, ask about order <code>o-1042</code>, then reload. The
          card comes back, because chat-service persists it against the message.
        </p>
      </section>

      <section>
        <h2>Saved conversations</h2>
        <p class="hint">
          <code>@thread-change</code> with reason <code>created</code> saves each new thread id
          here (localStorage, standing in for your database). Open one to see it read-only beside
          the live chat.
        </p>
        <p v-if="saved.length === 0" class="hint">None yet — send a message.</p>
        <ul v-else class="saved">
          <li v-for="t in saved" :key="t.threadId">
            <button
              :class="{ on: viewing?.threadId === t.threadId }"
              @click="
                viewing = t;
                note(`viewing ${t.threadId} read-only`);
              "
            >
              {{ titles[t.threadId] ?? t.threadId.slice(0, 8) + "…" }}
            </button>
            <span class="hint">{{ t.userId }}</span>
          </li>
        </ul>
        <div class="row">
          <button :disabled="saved.length === 0" @click="saved = []">forget all</button>
          <button @click="openForeign">open a foreign id</button>
        </div>
      </section>

      <section>
        <h2>Other actions</h2>
        <div class="row">
          <button @click="chat?.sendMessage('What can you do?')">sendMessage()</button>
          <button
            @click="
              chat?.newConversation();
              note('ref.newConversation()');
            "
          >
            newConversation()
          </button>
          <button @click="note(JSON.stringify(summarize(), null, 2))">getState()</button>
        </div>
      </section>

      <section>
        <h2>Events</h2>
        <button @click="log = []">clear</button>
        <pre class="log">{{ log.join("\n") || "…" }}</pre>
      </section>
    </aside>

    <main class="stage">
      <div v-if="blocked" class="blocked" role="alert">
        <strong>This origin is not allowed for that widget.</strong>
        <span>
          Add <code>{{ ORIGIN }}</code> to the widget's allowed origins (Security tab in the
          widget designer), then reload.
        </span>
      </div>
      <div class="frames">
        <div class="frame">
          <UraiChat
            ref="chat"
            :base-url="BASE_URL"
            :widget-token="WIDGET_TOKEN"
            :user-id="userId"
            :vars="route.vars"
            v-bind="skinProps"
            :display-components="DISPLAY_COMPONENTS"
            @ready="note('ready')"
            @user-message="(c: string) => note(`user-message: ${c.slice(0, 60)}`)"
            @assistant-reply="(c: string) => note(`assistant-reply: ${c.length} chars`)"
            @thread-change="onThreadChange"
            @command="(c: unknown) => note(`command: ${JSON.stringify(c)}`)"
            @error="onError"
          >
            <!-- A named scoped slot replaces a part, like an entry in
                 `components`. Only in the branded skin. -->
            <template v-if="skin === 'branded'" #EmptyState>
              <div class="demo-empty">
                <strong>How can we help?</strong>
                <span>Ask about billing, shipping or your account.</span>
              </div>
            </template>
          </UraiChat>
        </div>
        <div v-if="viewing" class="frame viewer">
          <div class="viewer-bar">
            <span>
              Read-only · <code>{{ viewing.threadId.slice(0, 8) }}…</code> as
              <code>{{ viewing.userId }}</code>
            </span>
            <button @click="viewing = null">close</button>
          </div>
          <!-- Changing thread-id loads the next thread in place — clicking
               another saved conversation does not remount the viewer. -->
          <UraiChat
            :base-url="BASE_URL"
            :widget-token="WIDGET_TOKEN"
            :user-id="viewing.userId"
            :thread-id="viewing.threadId"
            read-only
            :display-components="DISPLAY_COMPONENTS"
            @error="(e: string) => note(`viewer error: ${e}`)"
          />
        </div>
      </div>
    </main>
  </div>
</template>
