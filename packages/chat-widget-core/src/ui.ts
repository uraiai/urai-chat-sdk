// UI rendering: floating button + panel (header, message list, composer).
// All DOM lives inside a closed shadow root.

import type { ResolvedConfig } from "./config";
import { ICONS } from "./icons";
import { renderMarkdown } from "./markdown";
import type { ServerMessage, ThreadSummary, Transport } from "./transport";
import { clearThread, loadThread, saveThread } from "./session";
import type { WidgetEvent } from "./events";
import { applyTheme } from "./theme";
import { baseStyles } from "./styles";

interface MountArgs {
  shadow: ShadowRoot;
  config: ResolvedConfig;
  transport: Transport | null;
  widgetToken: string;
  initialUserId: string;
  /**
   * Initial vars context. Used for the first thread the visitor
   * creates and as the default if `setVars` is called before any
   * thread exists.
   */
  initialVars?: WidgetVars | null;
  hostElement: HTMLElement;
  /**
   * When true, all transport calls are bypassed: submit() renders a fake
   * streaming reply, threads are not created server-side, and
   * localStorage isn't touched. Used by the designer's live preview.
   */
  previewMode?: boolean;
  /** Instance-scoped event sink (the controller's Emitter). */
  emit: (event: WidgetEvent) => void;
}

export type WidgetVars = Record<string, unknown>;

export interface MountedWidget {
  open(): void;
  close(): void;
  toggle(): void;
  sendMessage(text: string): void;
  reset(): void;
  setUser(id: string, vars?: WidgetVars | null): void;
  setVars(vars: WidgetVars | null): void;
  startConversation(vars?: WidgetVars | null): void;
  applyConfig(config: ResolvedConfig): void;
  /**
   * Tear the widget down: close any in-flight SSE stream, cancel preview
   * timers, and remove the host element from the document. Idempotent.
   * No events are emitted after destroy.
   */
  destroy(): void;
}

interface UiState {
  threadId: string | null;
  isOpen: boolean;
  isSending: boolean;
  userId: string;
  /**
   * Vars to apply when the next thread is created. Also kept in sync
   * with the server when `setVars` is called against an existing
   * thread. `null` means no vars (server stores SQL NULL).
   */
  currentVars: WidgetVars | null;
  /**
   * Set by user-initiated reset paths (the "New conversation"
   * dropdown CTA, `startConversation` from the host SDK). The next
   * thread create POSTs `force_new: true` so the server doesn't
   * silently resume the visitor's most recent existing thread. Also
   * blocks `autoRestoreOnOpen` from snapping back to the old one if
   * the user closes and reopens the panel before sending. Cleared
   * once the new thread is created (or when the visitor identity
   * changes, since that's a fresh slate either way).
   */
  forceNewOnNextCreate: boolean;
}

export function mountWidget(args: MountArgs): MountedWidget {
  const { shadow, transport, hostElement, widgetToken } = args;
  const previewMode = !!args.previewMode;
  let config = args.config;

  // Set by destroy(). Async continuations (auto-restore, stream handlers,
  // preview timers) check it so a torn-down widget never mutates DOM or
  // emits events.
  let destroyed = false;
  let activeStreamClose: (() => void) | null = null;
  let previewTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = (event: WidgetEvent) => {
    if (!destroyed) args.emit(event);
  };

  function closeActiveStream() {
    if (activeStreamClose) {
      activeStreamClose();
      activeStreamClose = null;
    }
  }

  const state: UiState = {
    threadId: null,
    isOpen: config.layout.mode === "inline",
    isSending: false,
    userId: args.initialUserId,
    currentVars: args.initialVars ?? null,
    forceNewOnNextCreate: false,
  };

  const styleEl = document.createElement("style");
  styleEl.textContent = baseStyles;
  shadow.appendChild(styleEl);

  const root = document.createElement("div");
  root.className = "ucw-root";
  applyTheme(root, config.theme);
  shadow.appendChild(root);

  let panel: HTMLDivElement;
  let body: HTMLDivElement;
  let textarea: HTMLTextAreaElement;
  let sendBtn: HTMLButtonElement;
  let suggestedContainer: HTMLDivElement | null = null;
  let openButton: HTMLButtonElement | null = null;
  let threadTrigger: HTMLButtonElement | null = null;
  let dropdownEl: HTMLDivElement | null = null;
  let panelBodyArea: HTMLDivElement | null = null;
  let isDropdownOpen = false;
  let cachedThreads: ThreadSummary[] | null = null;

  function applyLayoutAttrs() {
    root.dataset.mode = config.layout.mode;
    root.dataset.position = config.layout.position;
    root.style.setProperty("--ucw-w", config.layout.width);
    root.style.setProperty("--ucw-h", config.layout.height);
  }

  function render() {
    applyLayoutAttrs();
    root.innerHTML = "";

    if (config.layout.mode === "floating") {
      openButton = document.createElement("button");
      openButton.className = "ucw-button";
      openButton.type = "button";
      openButton.innerHTML = `${ICONS.chat}<span>${escapeHtml(config.layout.buttonLabel)}</span>`;
      openButton.addEventListener("click", () => toggle());
      openButton.style.display = state.isOpen ? "none" : "inline-flex";
      root.appendChild(openButton);
    }

    panel = document.createElement("div");
    panel.className = "ucw-panel";
    panel.style.display = state.isOpen || config.layout.mode === "inline" ? "flex" : "none";

    if (config.layout.showHeader) {
      panel.appendChild(buildHeader());
    }

    // Wrapper around body + dropdown so the dropdown can sit absolutely
    // over the conversation area without leaking into the composer.
    panelBodyArea = document.createElement("div");
    panelBodyArea.className = "ucw-body-area";
    panelBodyArea.style.position = "relative";
    panelBodyArea.style.flex = "1";
    panelBodyArea.style.minHeight = "0";
    panelBodyArea.style.display = "flex";
    panelBodyArea.style.flexDirection = "column";

    body = document.createElement("div");
    body.className = "ucw-body";
    panelBodyArea.appendChild(body);
    panel.appendChild(panelBodyArea);

    panel.appendChild(buildComposer());

    if (config.behavior.footerText || config.behavior.disclaimer) {
      const f = document.createElement("div");
      f.className = "ucw-footer";
      f.textContent = config.behavior.disclaimer || config.behavior.footerText;
      panel.appendChild(f);
    }

    root.appendChild(panel);
    renderWelcome();
  }

  function buildHeader(): HTMLDivElement {
    const header = document.createElement("div");
    header.className = "ucw-header";
    if (config.layout.brandLogoUrl) {
      const img = document.createElement("img");
      img.src = config.layout.brandLogoUrl;
      img.alt = "";
      header.appendChild(img);
    }

    // The title doubles as the trigger for the thread-switcher dropdown
    // (chevron points the way). Clicking toggles the dropdown.
    threadTrigger = document.createElement("button");
    threadTrigger.type = "button";
    threadTrigger.className = "ucw-thread-trigger ucw-title";
    threadTrigger.setAttribute("aria-haspopup", "menu");
    threadTrigger.setAttribute("aria-expanded", "false");
    const triggerLabel = document.createElement("span");
    triggerLabel.className = "ucw-trigger-label";
    triggerLabel.textContent = config.layout.brandName;
    threadTrigger.appendChild(triggerLabel);
    const chevron = document.createElement("span");
    chevron.innerHTML = ICONS.chevron;
    threadTrigger.appendChild(chevron);
    threadTrigger.addEventListener("click", () => toggleDropdown());
    header.appendChild(threadTrigger);

    if (config.layout.mode === "floating") {
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.title = "Close";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.innerHTML = ICONS.close;
      closeBtn.addEventListener("click", () => close());
      header.appendChild(closeBtn);
    }
    return header;
  }

  // ---- Thread switcher dropdown ---------------------------------------

  function toggleDropdown() {
    if (isDropdownOpen) closeDropdown();
    else openDropdown();
  }

  async function openDropdown() {
    if (!panelBodyArea) return;
    isDropdownOpen = true;
    threadTrigger?.setAttribute("aria-expanded", "true");
    dropdownEl = buildDropdownShell();
    panelBodyArea.appendChild(dropdownEl);
    await refreshThreadList();
  }

  function closeDropdown() {
    isDropdownOpen = false;
    threadTrigger?.setAttribute("aria-expanded", "false");
    if (dropdownEl) {
      dropdownEl.remove();
      dropdownEl = null;
    }
  }

  function buildDropdownShell(): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "ucw-dropdown";

    const searchRow = document.createElement("div");
    searchRow.className = "ucw-dropdown-search";
    searchRow.innerHTML = ICONS.search;
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search conversations";
    search.addEventListener("input", () => renderDropdownList(search.value));
    searchRow.appendChild(search);
    el.appendChild(searchRow);

    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "ucw-new-conv";
    newBtn.innerHTML = `${ICONS.plus}<span>${escapeHtml(config.behavior.newConversationLabel)}</span>`;
    newBtn.addEventListener("click", () => {
      closeDropdown();
      reset();
    });
    el.appendChild(newBtn);

    const list = document.createElement("div");
    list.className = "ucw-dropdown-list";
    el.appendChild(list);

    return el;
  }

  async function refreshThreadList() {
    if (!transport) return;
    try {
      cachedThreads = await transport.listThreads();
    } catch (e) {
      console.warn("[UraiChat] thread list failed:", e);
      cachedThreads = [];
    }
    renderDropdownList("");
  }

  function renderDropdownList(filter: string) {
    if (!dropdownEl) return;
    const list = dropdownEl.querySelector(".ucw-dropdown-list") as HTMLElement | null;
    if (!list) return;
    list.innerHTML = "";

    const items = (cachedThreads ?? []).filter((t) => {
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        (t.last_message_preview ?? "").toLowerCase().includes(q)
      );
    });

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ucw-thread-empty";
      empty.textContent =
        cachedThreads === null
          ? "Loading…"
          : filter.trim()
            ? "No matches"
            : "No previous conversations yet";
      list.appendChild(empty);
      return;
    }

    const groups = groupByRecency(items);
    for (const [label, group] of groups) {
      const labelEl = document.createElement("div");
      labelEl.className = "ucw-group-label";
      labelEl.textContent = label;
      list.appendChild(labelEl);
      for (const t of group) {
        list.appendChild(buildThreadItem(t));
      }
    }
  }

  function buildThreadItem(t: ThreadSummary): HTMLButtonElement {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "ucw-thread-item";
    if (state.threadId === t.id) {
      item.setAttribute("aria-current", "true");
    }
    const title = document.createElement("div");
    title.className = "ucw-thread-title";
    title.textContent = t.title || "Untitled";
    item.appendChild(title);
    if (t.last_message_preview) {
      const preview = document.createElement("div");
      preview.className = "ucw-thread-preview";
      preview.textContent = t.last_message_preview;
      item.appendChild(preview);
    }
    const meta = document.createElement("div");
    meta.className = "ucw-thread-meta";
    meta.textContent = relativeTime(t.last_message_at ?? t.updated_at);
    item.appendChild(meta);
    item.addEventListener("click", () => {
      closeDropdown();
      void switchToThread(t.id);
    });
    return item;
  }

  async function switchToThread(id: string) {
    if (!transport) return;
    if (state.threadId === id) return;
    state.threadId = id;
    if (config.behavior.persistAcrossSessions) {
      saveThread(widgetToken, state.userId, id);
    }
    body.innerHTML = "";
    clearSuggested();
    try {
      const msgs = await transport.listMessages(id);
      if (destroyed) return;
      renderHistory(msgs);
    } catch (e) {
      if (destroyed) return;
      appendError(e instanceof Error ? e.message : String(e));
    }
  }

  function groupByRecency(
    items: ThreadSummary[],
  ): Array<[string, ThreadSummary[]]> {
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const groups: Record<string, ThreadSummary[]> = {
      Today: [],
      "Past week": [],
      Older: [],
    };
    const order = ["Today", "Past week", "Older"];
    for (const t of items) {
      const when = new Date(t.last_message_at ?? t.updated_at).getTime();
      const age = now - when;
      if (age < ONE_DAY) groups["Today"].push(t);
      else if (age < 7 * ONE_DAY) groups["Past week"].push(t);
      else groups["Older"].push(t);
    }
    return order
      .map((k): [string, ThreadSummary[]] => [k, groups[k]])
      .filter(([, g]) => g.length > 0);
  }

  function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    if (diff < 0) return "just now";
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
  }

  function buildComposer(): HTMLDivElement {
    const composer = document.createElement("div");
    composer.className = "ucw-composer";
    textarea = document.createElement("textarea");
    textarea.rows = 1;
    textarea.placeholder = config.behavior.placeholder;
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    textarea.addEventListener("input", autosize);
    sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.textContent = config.behavior.sendLabel;
    sendBtn.addEventListener("click", () => submit());
    composer.appendChild(textarea);
    composer.appendChild(sendBtn);
    return composer;
  }

  function autosize() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }

  function renderWelcome() {
    if (!state.threadId && config.behavior.welcomeMessage) {
      appendAssistantText(config.behavior.welcomeMessage);
    }
    if (!state.threadId && config.behavior.suggestedQuestions.length > 0) {
      suggestedContainer = document.createElement("div");
      suggestedContainer.className = "ucw-suggested";
      for (const q of config.behavior.suggestedQuestions) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = q;
        b.addEventListener("click", () => {
          textarea.value = q;
          submit();
        });
        suggestedContainer.appendChild(b);
      }
      body.appendChild(suggestedContainer);
    }
  }

  function clearSuggested() {
    if (suggestedContainer) {
      suggestedContainer.remove();
      suggestedContainer = null;
    }
  }

  function appendUserBubble(text: string) {
    const el = document.createElement("div");
    el.className = "ucw-bubble ucw-user";
    el.textContent = text;
    body.appendChild(el);
    scrollToBottom();
  }

  function appendAssistantText(text: string): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "ucw-bubble ucw-assistant";
    el.innerHTML = renderMarkdown(text);
    body.appendChild(el);
    scrollToBottom();
    return el;
  }

  function appendError(message: string) {
    const el = document.createElement("div");
    el.className = "ucw-bubble ucw-error";
    el.textContent = message;
    body.appendChild(el);
    scrollToBottom();
  }

  function appendTyping(): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "ucw-typing";
    el.textContent = "…";
    body.appendChild(el);
    scrollToBottom();
    return el;
  }

  function scrollToBottom() {
    queueMicrotask(() => {
      body.scrollTop = body.scrollHeight;
    });
  }

  function setSending(sending: boolean) {
    state.isSending = sending;
    sendBtn.disabled = sending;
    textarea.disabled = sending;
  }

  async function ensureThread(): Promise<string> {
    if (!transport) throw new Error("transport unavailable");
    if (state.threadId) return state.threadId;
    const cached = config.behavior.persistAcrossSessions
      ? loadThread(widgetToken, state.userId)
      : null;
    if (cached) {
      state.threadId = cached;
      try {
        const msgs = await transport.listMessages(cached);
        if (msgs.length > 0) {
          // Replace welcome with actual history.
          body.innerHTML = "";
          clearSuggested();
          renderHistory(msgs);
        }
      } catch {
        // If history fetch fails (e.g. server rotated tokens), drop the
        // stale cache and start fresh.
        clearThread(widgetToken, state.userId);
        state.threadId = null;
      }
      if (state.threadId) return state.threadId;
    }
    // First create for this conversation carries the buffered vars
    // (set via setUser/setVars/startConversation before any message)
    // and the force_new flag if the user explicitly asked for a new
    // conversation — without it the server resumes the visitor's
    // latest thread and "New conversation" becomes a no-op.
    const createBody: { force_new?: boolean; vars?: WidgetVars } = {};
    if (state.forceNewOnNextCreate) createBody.force_new = true;
    if (state.currentVars) createBody.vars = state.currentVars;
    const result = await transport.createOrResumeThread(createBody);
    state.forceNewOnNextCreate = false;
    state.threadId = result.thread_id;
    if (config.behavior.persistAcrossSessions) {
      saveThread(widgetToken, state.userId, result.thread_id);
    }
    return result.thread_id;
  }

  function renderHistory(messages: ServerMessage[]) {
    for (const m of messages) {
      if (m.role === "user") {
        appendUserBubble(m.content);
      } else if (m.role === "assistant" && m.content) {
        appendAssistantText(m.content);
      }
    }
  }

  async function submit() {
    if (destroyed) return;
    const text = textarea.value.trim();
    if (!text || state.isSending) return;
    textarea.value = "";
    autosize();
    clearSuggested();
    appendUserBubble(text);
    emit({ type: "user-message", content: text });
    setSending(true);

    if (previewMode) {
      simulatePreviewReply();
      return;
    }

    if (!transport) {
      setSending(false);
      return;
    }
    const typing = appendTyping();
    try {
      const threadId = await ensureThread();
      const send = await transport.sendMessage(threadId, text);
      typing.remove();
      if (destroyed) return;
      const bubble = appendAssistantText("");
      let buf = "";
      activeStreamClose = transport.streamMessage(send.assistant_message_id, {
        onChunk(chunk) {
          if (destroyed) return;
          buf += chunk;
          bubble.innerHTML = renderMarkdown(buf);
          scrollToBottom();
        },
        onComplete(msg) {
          if (destroyed) return;
          if (msg?.content) {
            buf = msg.content;
            bubble.innerHTML = renderMarkdown(buf);
            scrollToBottom();
          }
        },
        onDone() {
          activeStreamClose = null;
          if (destroyed) return;
          emit({ type: "assistant-reply", content: buf });
          setSending(false);
        },
        onError(err) {
          activeStreamClose = null;
          if (destroyed) return;
          appendError(err);
          emit({ type: "error", error: err });
          setSending(false);
        },
      });
    } catch (e: unknown) {
      typing.remove();
      const msg = e instanceof Error ? e.message : String(e);
      appendError(msg);
      emit({ type: "error", error: msg });
      setSending(false);
    }
  }

  function simulatePreviewReply() {
    const bubble = appendAssistantText("");
    const reply =
      "This is a preview reply — your real assistant will answer here once " +
      "the widget is embedded on your site.";
    let i = 0;
    const step = () => {
      if (destroyed) return;
      i = Math.min(reply.length, i + 4);
      bubble.innerHTML = renderMarkdown(reply.slice(0, i));
      scrollToBottom();
      if (i < reply.length) {
        previewTimer = setTimeout(step, 24);
      } else {
        previewTimer = null;
        emit({ type: "assistant-reply", content: reply });
        setSending(false);
      }
    };
    previewTimer = setTimeout(step, 120);
  }

  function open() {
    if (state.isOpen) return;
    state.isOpen = true;
    panel.style.display = "flex";
    if (openButton) openButton.style.display = "none";
    textarea?.focus();
    void autoRestoreOnOpen();
    emit({ type: "opened" });
  }

  /**
   * The first time the panel opens with no active thread, ask the
   * server for this visitor's threads and resume the most recent one
   * (matching the Cloudflare-style UX). Subsequent opens skip the fetch
   * — `cachedThreads` stays populated for the lifetime of the page.
   */
  async function autoRestoreOnOpen() {
    if (!transport || destroyed) return;
    if (state.threadId) return;
    // The user just asked for a new conversation; don't quietly snap
    // them back to an old thread when they reopen the panel.
    if (state.forceNewOnNextCreate) return;
    if (cachedThreads === null) {
      try {
        cachedThreads = await transport.listThreads();
      } catch {
        cachedThreads = [];
      }
    }
    if (destroyed || cachedThreads.length === 0) return;
    // Prefer the localStorage cache if it points at a still-existing
    // thread; otherwise fall back to the most-recent server thread.
    const cachedId = config.behavior.persistAcrossSessions
      ? loadThread(widgetToken, state.userId)
      : null;
    const target =
      (cachedId && cachedThreads.find((t) => t.id === cachedId)) ||
      cachedThreads[0];
    if (target) await switchToThread(target.id);
  }

  function close() {
    if (!state.isOpen || config.layout.mode === "inline") return;
    state.isOpen = false;
    panel.style.display = "none";
    if (openButton) openButton.style.display = "inline-flex";
    if (config.behavior.resetOnClose) reset();
    emit({ type: "closed" });
  }

  function toggle() {
    if (state.isOpen) close();
    else open();
  }

  function reset() {
    closeActiveStream();
    state.threadId = null;
    // Tell the next createOrResumeThread to actually create — without
    // this, the server's resume-by-default logic would hand back the
    // visitor's most recent existing thread.
    state.forceNewOnNextCreate = true;
    if (!previewMode) {
      clearThread(widgetToken, state.userId);
    }
    if (body) {
      body.innerHTML = "";
      renderWelcome();
    }
    // The new thread won't appear in the dropdown until a message is
    // sent and the server creates the row — invalidate the cache so the
    // next open pulls a fresh list including it.
    cachedThreads = null;
  }

  function setUser(id: string, vars?: WidgetVars | null) {
    const userChanged = id !== state.userId;
    if (userChanged) {
      closeActiveStream();
      state.userId = id;
      if (transport) transport.setWidgetUserId(id);
      state.threadId = null;
      cachedThreads = null;
      // Identity change is a fresh slate — clear any pending
      // "New conversation" intent so the new visitor's existing
      // threads can auto-restore on next open.
      state.forceNewOnNextCreate = false;
      if (body) {
        body.innerHTML = "";
        renderWelcome();
      }
    }
    // vars supplied alongside a setUser call become the default for the
    // next thread (whether the user changed or not). `undefined` means
    // "leave alone"; explicit `null` clears.
    if (vars !== undefined) {
      state.currentVars = vars;
      // If we already have an active thread for this visitor, push the
      // change to the server so subsequent turns of that thread see it.
      if (!userChanged && transport && state.threadId && !previewMode) {
        void transport
          .updateThreadVars(state.threadId, vars)
          .catch((e) => console.warn("[UraiChat] setUser vars patch:", e));
      }
    }
  }

  function setVars(vars: WidgetVars | null) {
    state.currentVars = vars;
    if (transport && state.threadId && !previewMode) {
      void transport
        .updateThreadVars(state.threadId, vars)
        .catch((e) => console.warn("[UraiChat] setVars patch:", e));
    }
  }

  function startConversation(vars?: WidgetVars | null) {
    // Buffer the vars so the next thread creation picks them up. We
    // don't hit the server now — the thread is created lazily on the
    // first message, which keeps "every navigation calls
    // startConversation" cheap.
    if (vars !== undefined) state.currentVars = vars;
    reset();
  }

  function applyConfig(next: ResolvedConfig) {
    const prev = config;
    config = next;
    applyTheme(root, config.theme);

    // Structural changes (mode, position, header visibility, presence of
    // logo/footer/disclaimer/welcome/suggested chips) require a full
    // rebuild — those control whether elements exist at all. The current
    // conversation is lost in that case.
    //
    // Cosmetic changes (colours, labels, placeholder, brand name text,
    // logo url swap, footer text swap) update in place so an ongoing
    // chat survives a theme tweak — the central preview-iframe use case.
    const structural =
      prev.layout.mode !== next.layout.mode ||
      prev.layout.position !== next.layout.position ||
      prev.layout.showHeader !== next.layout.showHeader ||
      !!prev.layout.brandLogoUrl !== !!next.layout.brandLogoUrl ||
      !!prev.behavior.disclaimer !== !!next.behavior.disclaimer ||
      !!prev.behavior.footerText !== !!next.behavior.footerText ||
      prev.behavior.welcomeMessage !== next.behavior.welcomeMessage ||
      JSON.stringify(prev.behavior.suggestedQuestions) !==
        JSON.stringify(next.behavior.suggestedQuestions);

    if (structural) {
      render();
      return;
    }

    if (openButton) {
      openButton.innerHTML = `${ICONS.chat}<span>${escapeHtml(config.layout.buttonLabel)}</span>`;
    }
    // The header's "title" is now the thread-switcher trigger; updating
    // textContent would wipe its chevron icon. Target the label span
    // inside instead.
    const triggerLabelEl = shadow.querySelector(
      ".ucw-thread-trigger .ucw-trigger-label",
    ) as HTMLElement | null;
    if (triggerLabelEl) triggerLabelEl.textContent = config.layout.brandName;
    const logoImg = shadow.querySelector(
      ".ucw-header img",
    ) as HTMLImageElement | null;
    if (logoImg && config.layout.brandLogoUrl) {
      logoImg.src = config.layout.brandLogoUrl;
    }
    const footerEl = shadow.querySelector(".ucw-footer") as HTMLElement | null;
    if (footerEl) {
      footerEl.textContent =
        config.behavior.disclaimer || config.behavior.footerText;
    }
    if (textarea) textarea.placeholder = config.behavior.placeholder;
    if (sendBtn) sendBtn.textContent = config.behavior.sendLabel;
  }

  // Inline mode renders into the host element instead of fixed-positioned.
  if (config.layout.mode === "inline") {
    hostElement.style.display = "block";
  }

  render();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    closeActiveStream();
    if (previewTimer !== null) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
    hostElement.remove();
  }

  return {
    open,
    close,
    toggle,
    sendMessage: (t: string) => {
      textarea.value = t;
      submit();
    },
    reset,
    setUser,
    setVars,
    startConversation,
    applyConfig,
    destroy,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default:  return "&#39;";
    }
  });
}
