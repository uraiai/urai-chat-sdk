// UI rendering: floating button + panel (header, message list, composer).
// All DOM lives inside a closed shadow root.

import type { ResolvedConfig } from "./config";
import { ICONS } from "./icons";
import { renderMarkdown } from "./markdown";
import type {
  MessageComponent,
  ServerMessage,
  ThreadSummary,
  Transport,
  WidgetAttachment,
  WidgetMessageAttachment,
  WorkspaceFile,
} from "./transport";
import { clearThread, loadThread, saveThread } from "./session";
import { saveBlob } from "./download";
import type { WidgetEvent } from "./events";
import { applyTheme } from "./theme";
import { baseStyles } from "./styles";
// Framework-agnostic models. This file owns the DOM; these own the state.
import { createToolActivity } from "./headless/tool-activity";
import { createReasoning } from "./headless/reasoning";
import {
  fileVersion,
  freshFiles,
  isImageFile,
  isScriptableFile,
  workspaceFileName,
} from "./headless/files";
import { parseDisplayComponent } from "./headless/components";
import {
  filterThreads,
  groupByRecency,
  relativeTime,
} from "./headless/thread-list";

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
  /**
   * Initial knowledge scope (collection ids). Used for the first thread the
   * visitor creates and as the default if `setCollections` is called before
   * any thread exists.
   */
  initialCollections?: string[] | null;
  hostElement: HTMLElement;
  /**
   * When true, all transport calls are bypassed: submit() renders a fake
   * streaming reply, threads are not created server-side, and
   * localStorage isn't touched. Used by the designer's live preview.
   */
  previewMode?: boolean;
  /** Instance-scoped event sink (the controller's Emitter). */
  emit: (event: WidgetEvent) => void;
  /** Renderers for components tools ask to display, by name. */
  displayComponents?: ComponentRenderers;
}

export type WidgetVars = Record<string, unknown>;

/**
 * Draws one component a tool asked for with
 * `sendCommand(thread_id, { command: "displayComponent", component, props })`.
 *
 * `element` lives in the host page's DOM — projected into the reply
 * bubble through a `<slot>` — so the page's own stylesheets apply and a
 * React, Vue or Svelte app can be mounted into it. Return a cleanup
 * function to run when the message leaves the transcript (new
 * conversation, thread switch, destroy).
 *
 * `props` is tool output: validate it before trusting it, and never put
 * it into `innerHTML`.
 */
export type ComponentRenderer = (
  element: HTMLElement,
  props: Record<string, unknown>,
  context: ComponentRenderContext,
) => void | (() => void);

export interface ComponentRenderContext {
  /** The name the tool asked for — the key this renderer is registered under. */
  component: string;
  /** Send a message as the visitor, e.g. from a button in the component. */
  sendMessage(text: string): void;
}

/** Component name → renderer. A name with no renderer is not shown. */
export type ComponentRenderers = Record<string, ComponentRenderer>;

/**
 * Argument to `startConversation`. Historically a bare vars object; the
 * object form was added for `collections` and is detected by the presence of
 * a `vars` or `collections` key — see [`asStartOptions`].
 */
export type StartConversationArg =
  | WidgetVars
  | null
  | { vars?: WidgetVars | null; collections?: string[] | null };

/**
 * Normalise `startConversation`'s argument into `{vars, collections}`.
 *
 * The original signature took a bare vars object, and hosts still call it
 * that way, so the options form is detected by the presence of a `vars` or
 * `collections` key. A host whose vars literally contain a top-level `vars`
 * key would be misread — hence the discriminator being documented rather than
 * inferred silently. A bare `{}` is ambiguous under this test but means the
 * same thing either way: start fresh, change no context.
 */
export function asStartOptions(arg?: StartConversationArg): {
  vars?: WidgetVars | null;
  collections?: string[] | null;
} {
  if (arg === undefined) return {};
  if (arg === null) return { vars: null };
  if ("vars" in arg || "collections" in arg) {
    return arg as { vars?: WidgetVars | null; collections?: string[] | null };
  }
  return { vars: arg as WidgetVars };
}

export interface MountedWidget {
  open(): void;
  close(): void;
  toggle(): void;
  sendMessage(text: string): void;
  reset(): void;
  setUser(id: string, vars?: WidgetVars | null): void;
  setVars(vars: WidgetVars | null): void;
  setCollections(collections: string[] | null): void;
  startConversation(opts?: StartConversationArg): void;
  applyConfig(config: ResolvedConfig): void;
  /**
   * Tear the widget down: close any in-flight SSE stream, cancel preview
   * timers, and remove the host element from the document. Idempotent.
   * No events are emitted after destroy.
   */
  destroy(): void;
}

/**
 * In-composer state for a file the visitor picked. Stays "uploading"
 * until the server returns a bucket_path; on success it carries the
 * descriptor we'll send with the next message. Errors are surfaced via
 * the chip itself and don't block the visitor from removing it or
 * picking new files.
 */
interface PendingAttachment {
  localId: number;
  fileName: string;
  mimeType: string;
  /** Kept around so the user bubble can render a preview from the local
   *  blob instead of round-tripping through the download endpoint. */
  file: File;
  status: "uploading" | "ready" | "error";
  errorMessage?: string;
  uploaded?: WidgetAttachment;
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
   * Knowledge collection ids to apply when the next thread is created, and
   * kept in sync with the server when `setCollections` is called against an
   * existing thread. `null` means "no extra scope" — the assistant's own
   * collections are unaffected either way; this list can only add to them.
   */
  currentCollections: string[] | null;
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
  /**
   * Whether the persistent per-marker chip is rendered in the prose. Off
   * unless the embedder opts in; dev mode implies it. The live activity
   * row is not gated by this — it is transient and self-replacing.
   * Read at call time, like `behavior.dev`, because `applyConfig`
   * reassigns `config`.
   */
  const showToolCalls = () =>
    config.behavior.showToolCalls || config.behavior.dev;

  /**
   * Renders markdown with `behavior.dev` threaded through every call.
   * Without dev mode the renderer strips agent-mode code-action fences
   * and `<urai-tool-call>` markers so embedders' end-users don't see
   * implementation noise. `config` is reassigned by `applyConfig`, so
   * we read `config.behavior.dev` at call time rather than capturing
   * it at mount time.
   */
  const renderMd = (
    text: string,
    toolSummaries?: Record<string, string>,
  ) =>
    renderMarkdown(text, {
      dev: config.behavior.dev,
      showToolCalls: showToolCalls(),
      toolSummaries,
    });

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
    currentCollections: args.initialCollections ?? null,
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
  let attachBtn: HTMLButtonElement | null = null;
  let fileInput: HTMLInputElement | null = null;
  let pendingRow: HTMLDivElement | null = null;
  let suggestedContainer: HTMLDivElement | null = null;
  let openButton: HTMLButtonElement | null = null;
  let threadTrigger: HTMLButtonElement | null = null;
  let archiveBtn: HTMLButtonElement | null = null;
  let archiveDownloading = false;
  let dropdownEl: HTMLDivElement | null = null;
  let panelBodyArea: HTMLDivElement | null = null;
  let isDropdownOpen = false;
  let cachedThreads: ThreadSummary[] | null = null;
  const pendingAttachments: PendingAttachment[] = [];
  let pendingLocalIdSeq = 0;
  /** ObjectURLs we minted for inline attachment previews; revoked on reset/destroy. */
  const attachmentObjectUrls: string[] = [];
  /**
   * The version (`fileVersion`) of each workspace path the transcript
   * shows. A live turn shows only files new to this map or rewritten since.
   * Cleared whenever the transcript is.
   */
  const shownFileVersions = new Map<string, string>();
  /**
   * Every file row in the transcript, so a committed turn can take the
   * files it rewrote off earlier messages — history lists a file only
   * under the turn that wrote it last. Cleared with the transcript.
   */
  const fileLists: ReturnType<typeof makeFileList>[] = [];
  /**
   * Every rendered component's light-DOM element and cleanup. Their slots
   * go with the transcript, but the elements are children of the host
   * element and would outlive it — see `disposeComponents`.
   */
  const mountedComponents: { element: HTMLElement; cleanup: (() => void) | null }[] = [];
  let componentSlotSeq = 0;
  /** Names already warned about, so a missing renderer logs once. */
  const unknownComponents = new Set<string>();

  function applyLayoutAttrs() {
    root.dataset.mode = config.layout.mode;
    root.dataset.position = config.layout.position;
    root.style.setProperty("--ucw-w", config.layout.width);
    root.style.setProperty("--ucw-h", config.layout.height);
  }

  function render() {
    applyLayoutAttrs();
    disposeComponents();
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

    // "Download everything" is thread-level, so it lives in the header —
    // the same place the app puts it — and appears once the transcript has
    // shown a file. Preview mode has no thread to zip.
    if (!previewMode) {
      archiveBtn = document.createElement("button");
      archiveBtn.type = "button";
      archiveBtn.className = "ucw-archive";
      archiveBtn.title = "Download all files";
      archiveBtn.setAttribute("aria-label", "Download all files");
      archiveBtn.innerHTML = ICONS.download;
      archiveBtn.addEventListener("click", () => void downloadArchive());
      header.appendChild(archiveBtn);
      syncArchiveButton();
    }

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

  /** Show the zip button once the transcript has shown a file. */
  function syncArchiveButton(liveTurnHasFiles = false) {
    if (!archiveBtn) return;
    archiveBtn.hidden = !state.threadId || (shownFileVersions.size === 0 && !liveTurnHasFiles);
  }

  /**
   * Fetch the thread's zip and save it. Fetched, not linked: the visitor
   * header is what scopes the read. Buffered whole before the save, so the
   * button reports busy until then.
   */
  async function downloadArchive() {
    const threadId = state.threadId;
    if (!transport || !threadId || archiveDownloading || !archiveBtn) return;
    const btn = archiveBtn;
    archiveDownloading = true;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.dataset.state = "downloading";
    try {
      const archive = await transport.fetchThreadArchive(threadId);
      if (destroyed) return;
      saveBlob(archive.blob, archive.fileName);
    } catch (e) {
      if (destroyed) return;
      console.warn("[UraiChat] archive download failed:", e);
      appendError("Could not download the files");
    } finally {
      archiveDownloading = false;
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      delete btn.dataset.state;
    }
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

    const items = filterThreads(cachedThreads ?? [], filter);

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
    disposeComponents();
    shownFileVersions.clear();
    fileLists.length = 0;
    syncArchiveButton();
    try {
      const msgs = await transport.listMessages(id);
      if (destroyed) return;
      renderHistory(msgs);
    } catch (e) {
      if (destroyed) return;
      appendError(e instanceof Error ? e.message : String(e));
    }
  }

  function buildComposer(): HTMLDivElement {
    const composer = document.createElement("div");
    composer.className = "ucw-composer";

    pendingRow = document.createElement("div");
    pendingRow.className = "ucw-pending";
    pendingRow.style.display = "none";
    composer.appendChild(pendingRow);

    const row = document.createElement("div");
    row.className = "ucw-composer-row";

    // Attachments are unsupported in preview mode (no backing transport).
    if (transport && !previewMode) {
      attachBtn = document.createElement("button");
      attachBtn.type = "button";
      attachBtn.className = "ucw-attach-btn";
      attachBtn.title = "Attach files";
      attachBtn.setAttribute("aria-label", "Attach files");
      attachBtn.innerHTML = ICONS.paperclip;
      attachBtn.addEventListener("click", () => fileInput?.click());
      row.appendChild(attachBtn);

      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.multiple = true;
      fileInput.className = "ucw-attach-input";
      fileInput.addEventListener("change", () => {
        if (!fileInput?.files) return;
        const picked = Array.from(fileInput.files);
        fileInput.value = "";
        for (const f of picked) void startUpload(f);
      });
      row.appendChild(fileInput);
    }

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
    row.appendChild(textarea);
    row.appendChild(sendBtn);
    composer.appendChild(row);
    return composer;
  }

  // ---- Attachment composer state ---------------------------------------

  async function startUpload(file: File) {
    if (!transport) return;
    const pending: PendingAttachment = {
      localId: ++pendingLocalIdSeq,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      file,
      status: "uploading",
    };
    pendingAttachments.push(pending);
    renderPendingAttachments();
    try {
      const uploaded = await transport.uploadAttachment(file);
      if (destroyed) return;
      pending.status = "ready";
      pending.uploaded = uploaded;
      pending.mimeType = uploaded.mime_type;
    } catch (e: unknown) {
      if (destroyed) return;
      pending.status = "error";
      pending.errorMessage = e instanceof Error ? e.message : String(e);
    }
    renderPendingAttachments();
  }

  function removePending(localId: number) {
    const idx = pendingAttachments.findIndex((p) => p.localId === localId);
    if (idx >= 0) {
      pendingAttachments.splice(idx, 1);
      renderPendingAttachments();
    }
  }

  function renderPendingAttachments() {
    if (!pendingRow) return;
    pendingRow.innerHTML = "";
    if (pendingAttachments.length === 0) {
      pendingRow.style.display = "none";
      return;
    }
    pendingRow.style.display = "flex";
    for (const p of pendingAttachments) {
      const chip = document.createElement("div");
      chip.className = "ucw-pending-chip";
      if (p.status === "uploading") chip.classList.add("ucw-pending-uploading");
      if (p.status === "error") chip.classList.add("ucw-pending-error");

      const name = document.createElement("span");
      name.className = "ucw-pending-chip-name";
      name.textContent =
        p.status === "uploading"
          ? `${p.fileName}…`
          : p.status === "error"
            ? `${p.fileName} — failed`
            : p.fileName;
      name.title = p.status === "error" && p.errorMessage ? p.errorMessage : p.fileName;
      chip.appendChild(name);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.title = "Remove";
      remove.setAttribute("aria-label", "Remove attachment");
      remove.innerHTML = ICONS.x;
      remove.addEventListener("click", () => removePending(p.localId));
      chip.appendChild(remove);

      pendingRow.appendChild(chip);
    }
  }

  function clearPendingAttachments() {
    pendingAttachments.length = 0;
    renderPendingAttachments();
  }

  function revokeAttachmentObjectUrls() {
    for (const url of attachmentObjectUrls) {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
    attachmentObjectUrls.length = 0;
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

  /**
   * Append a user bubble with text and/or attachments. The attachments
   * source is polymorphic:
   *   - `remote` for history items — fetched via the widget API on demand
   *   - `local` for the visitor's just-picked files — already in-browser
   *     so we render straight from the File via `URL.createObjectURL`.
   */
  type LocalAttachment = { kind: "local"; file: File; mimeType: string; fileName: string };
  type RemoteAttachment = { kind: "remote"; messageId: string; attachment: WidgetMessageAttachment };
  type RenderableAttachment = LocalAttachment | RemoteAttachment;

  function appendUserBubble(text: string, attachments?: RenderableAttachment[]) {
    const el = document.createElement("div");
    el.className = "ucw-bubble ucw-user";
    if (text) {
      const textEl = document.createElement("div");
      textEl.textContent = text;
      el.appendChild(textEl);
    }
    if (attachments && attachments.length > 0) {
      el.appendChild(buildAttachmentList(attachments));
    }
    body.appendChild(el);
    scrollToBottom();
  }

  function buildAttachmentList(items: RenderableAttachment[]): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "ucw-attachments";
    for (const item of items) {
      const fileName = item.kind === "local" ? item.fileName : item.attachment.file_name;
      const mime = item.kind === "local" ? item.mimeType : item.attachment.mime_type;
      const isImage = mime.startsWith("image/");
      if (isImage) {
        const img = document.createElement("img");
        img.className = "ucw-attachment-image";
        img.alt = fileName;
        img.title = fileName;
        img.src =
          "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'></svg>";
        void hydrateImage(img, item);
        row.appendChild(img);
      } else {
        const link = document.createElement("button");
        link.type = "button";
        link.className = "ucw-attachment-file";
        link.title = fileName;
        link.innerHTML = `${ICONS.file}<span class="ucw-attachment-file-name">${escapeHtml(fileName)}</span>${ICONS.download}`;
        link.addEventListener("click", () => void downloadAttachment(item));
        row.appendChild(link);
      }
    }
    return row;
  }

  async function resolveAttachmentBlob(item: RenderableAttachment): Promise<Blob | null> {
    if (item.kind === "local") return item.file;
    if (!transport) return null;
    try {
      return await transport.fetchAttachment(item.messageId, item.attachment.id);
    } catch (e) {
      console.warn("[UraiChat] attachment fetch failed:", e);
      return null;
    }
  }

  async function hydrateImage(img: HTMLImageElement, item: RenderableAttachment) {
    const blob = await resolveAttachmentBlob(item);
    if (!blob || destroyed) return;
    const url = URL.createObjectURL(blob);
    attachmentObjectUrls.push(url);
    img.src = url;
    img.addEventListener("click", () => window.open(url, "_blank"));
  }

  async function downloadAttachment(item: RenderableAttachment) {
    const blob = await resolveAttachmentBlob(item);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    attachmentObjectUrls.push(url);
    const fileName = item.kind === "local" ? item.fileName : item.attachment.file_name;
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // ---- Workspace files ---------------------------------------------------

  /** A transparent 1×1, so an image reserves no broken-icon while it loads. */
  const BLANK_IMAGE =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'></svg>";

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function fetchFileUrl(threadId: string, path: string, download: boolean) {
    if (!transport) return null;
    try {
      let blob = await transport.fetchThreadFile(threadId, path);
      // A download never navigates, but retyping anything that could run
      // script makes sure its object URL is inert even if something does.
      if (download && isScriptableFile(path)) {
        blob = new Blob([blob], { type: "application/octet-stream" });
      }
      const url = URL.createObjectURL(blob);
      attachmentObjectUrls.push(url);
      return url;
    } catch (e) {
      console.warn("[UraiChat] file fetch failed:", e);
      return null;
    }
  }

  function saveUrl(url: string, fileName: string) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /**
   * One workspace file: an image inline, anything else a download chip.
   *
   * Clicking a raster image opens it full size, as attachments do. An SVG
   * **downloads** instead: its object URL has the host page's origin, so
   * opening it in a tab would run whatever script agent code put in it as
   * the embedding site. Inside the `<img>` it is inert.
   */
  function buildFileItem(threadId: string, file: WorkspaceFile): HTMLElement {
    const name = workspaceFileName(file.path);
    if (isImageFile(file.path)) {
      const img = document.createElement("img");
      img.className = "ucw-attachment-image ucw-file-image";
      img.alt = name;
      img.title = file.path;
      img.src = BLANK_IMAGE;
      void fetchFileUrl(threadId, file.path, false).then((url) => {
        if (!url || destroyed) return;
        img.src = url;
        img.addEventListener("click", () => {
          if (isScriptableFile(file.path)) {
            void fetchFileUrl(threadId, file.path, true).then((u) => u && saveUrl(u, name));
          } else {
            window.open(url, "_blank");
          }
        });
      });
      return img;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ucw-attachment-file";
    button.title = file.path;
    const size = file.bytes > 0 ? `<span class="ucw-file-size">${formatBytes(file.bytes)}</span>` : "";
    button.innerHTML = `${ICONS.file}<span class="ucw-attachment-file-name">${escapeHtml(name)}</span>${size}${ICONS.download}`;
    button.addEventListener("click", () => {
      void fetchFileUrl(threadId, file.path, true).then((url) => url && saveUrl(url, name));
    });
    return button;
  }

  /**
   * The files row on an assistant bubble. Re-rendered on every listing a
   * live turn reports, so items are kept by `path@bytes` across calls:
   * rebuilding them would refetch every image each time a tool finishes.
   */
  function makeFileList(bubble: HTMLDivElement, threadId: string) {
    let row: HTMLDivElement | null = null;
    const items = new Map<string, HTMLElement>();
    let current: WorkspaceFile[] = [];
    return {
      get files() {
        return current;
      },
      set(files: WorkspaceFile[]) {
        current = files;
        if (files.length === 0) {
          row?.remove();
          row = null;
          return;
        }
        if (!row) {
          row = document.createElement("div");
          row.className = "ucw-attachments ucw-files";
          bubble.appendChild(row);
        }
        const next = files.map((f) => {
          const key = `${f.path}@${fileVersion(f)}`;
          const el = items.get(key) ?? buildFileItem(threadId, f);
          items.set(key, el);
          return el;
        });
        row.replaceChildren(...next);
        scrollToBottom();
      },
    };
  }

  // ---- Rich components ---------------------------------------------------

  /**
   * The components row on an assistant bubble, created on the first
   * component. It sits above the files row whichever arrives first, so the
   * reply reads text → components → files live and in history alike.
   */
  function makeComponentList(bubble: HTMLDivElement) {
    let row: HTMLDivElement | null = null;
    return {
      add(item: MessageComponent) {
        if (!row) {
          row = document.createElement("div");
          row.className = "ucw-components";
          bubble.insertBefore(row, bubble.querySelector(":scope > .ucw-files"));
        }
        mountComponent(row, item);
        if (row.childElementCount === 0) {
          row.remove();
          row = null;
        }
        scrollToBottom();
      },
    };
  }

  /**
   * Render one component. The renderer draws into an element appended to
   * the **host element's light DOM** and projected into the bubble through
   * a named `<slot>`: inside the closed shadow root, the page's stylesheets
   * would not apply and a framework app mounted there could not be styled.
   *
   * Renderers are looked up as own properties only, so a tool naming
   * `constructor` or `toString` finds nothing. One that throws is logged
   * and its element removed; the rest of the reply is unaffected.
   */
  function mountComponent(row: HTMLElement, item: MessageComponent) {
    const renderers = args.displayComponents;
    const renderer =
      renderers && Object.prototype.hasOwnProperty.call(renderers, item.component)
        ? renderers[item.component]
        : undefined;
    if (typeof renderer !== "function") {
      if (!unknownComponents.has(item.component)) {
        unknownComponents.add(item.component);
        console.warn(
          `[UraiChat] no renderer registered for component "${item.component}"`,
        );
      }
      return;
    }

    const slotName = `ucw-component-${++componentSlotSeq}`;
    const element = document.createElement("div");
    element.slot = slotName;
    element.dataset.uraiComponent = item.component;
    hostElement.appendChild(element);
    const slot = document.createElement("slot");
    slot.name = slotName;
    row.appendChild(slot);

    const mounted = { element, cleanup: null as (() => void) | null };
    mountedComponents.push(mounted);
    try {
      const cleanup = renderer(element, item.props, {
        component: item.component,
        sendMessage: sendMessageAsVisitor,
      });
      if (typeof cleanup === "function") mounted.cleanup = cleanup;
    } catch (e) {
      console.error(`[UraiChat] component "${item.component}" failed to render:`, e);
      mountedComponents.splice(mountedComponents.indexOf(mounted), 1);
      element.remove();
      slot.remove();
    }
  }

  /** Run every component's cleanup and remove its element. */
  function disposeComponents() {
    for (const { element, cleanup } of mountedComponents.splice(0)) {
      try {
        cleanup?.();
      } catch (e) {
        console.error("[UraiChat] component cleanup failed:", e);
      }
      element.remove();
    }
  }

  function appendAssistantText(
    text: string,
    toolSummaries?: Record<string, string>,
  ): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "ucw-bubble ucw-assistant";
    el.innerHTML = renderMd(text, toolSummaries);
    body.appendChild(el);
    scrollToBottom();
    return el;
  }

  /**
   * Live status row attached to a streaming assistant bubble. The set of
   * in-flight tool calls is modelled in `headless/tool-activity`; this is
   * the DOM adapter over it. Text reflects the most recent call because
   * crowding multiple names into a small widget panel reads worse than a
   * single rolling label. Disappears when the set empties.
   */
  function makeToolActivityTracker(bubble: HTMLDivElement) {
    const model = createToolActivity();
    let row: HTMLDivElement | null = null;
    let label: HTMLSpanElement | null = null;

    function render() {
      const snapshot = model.snapshot();
      if (!snapshot) {
        if (row) {
          row.remove();
          row = null;
          label = null;
        }
        return;
      }
      if (!row) {
        row = document.createElement("div");
        row.className = "ucw-tool-activity";
        const dot = document.createElement("span");
        dot.className = "ucw-tool-activity-dot";
        label = document.createElement("span");
        row.appendChild(dot);
        row.appendChild(label);
        bubble.prepend(row);
      }
      if (label) {
        label.textContent = snapshot.completed
          ? snapshot.label
          : `${snapshot.label}…`;
      }
      scrollToBottom();
    }

    return {
      start(id: string, fnName: string) {
        model.start(id, fnName);
        render();
      },
      complete(id: string) {
        model.complete(id);
        render();
      },
      setSummary(id: string, summary: string) {
        model.setSummary(id, summary);
        render();
      },
      clear() {
        model.clear();
        render();
      },
    };
  }

  function appendError(message: string) {
    const el = document.createElement("div");
    el.className = "ucw-bubble ucw-error";
    el.textContent = message;
    body.appendChild(el);
    scrollToBottom();
  }

  /**
   * "Thinking…" placeholder shown between sending and the first byte of
   * model output. Kept alive until either a content chunk OR a reasoning
   * chunk arrives — whichever comes first — so the visitor never sees an
   * empty bubble while the model is reasoning silently.
   */
  function appendThinking(): { remove(): void } {
    const el = document.createElement("div");
    el.className = "ucw-thinking";
    const dots = document.createElement("span");
    dots.className = "ucw-thinking-dots";
    dots.innerHTML = `<span></span><span></span><span></span>`;
    const label = document.createElement("span");
    label.textContent = "Thinking";
    el.appendChild(dots);
    el.appendChild(label);
    body.appendChild(el);
    scrollToBottom();
    let removed = false;
    return {
      remove() {
        if (removed) return;
        removed = true;
        el.remove();
      },
    };
  }

  /**
   * Reasoning section attached to an assistant bubble. Live state
   * streams text into a muted/italic block; `seal()` swaps it for a
   * collapsed "Thoughts" disclosure when the first answer chunk lands.
   * Accumulation and the idempotent seal live in `headless/reasoning`;
   * this is the DOM adapter over that model.
   */
  function makeReasoningSection(bubble: HTMLDivElement) {
    const model = createReasoning();
    let container: HTMLDivElement | null = null;
    let liveEl: HTMLDivElement | null = null;

    function ensureContainer(): HTMLDivElement {
      if (container) return container;
      container = document.createElement("div");
      container.className = "ucw-reasoning";
      container.dataset.expanded = "true";
      liveEl = document.createElement("div");
      liveEl.className = "ucw-reasoning-live";
      container.appendChild(liveEl);
      bubble.prepend(container);
      return container;
    }

    return {
      append(chunk: string) {
        if (model.snapshot().sealed) return;
        model.append(chunk);
        ensureContainer();
        if (liveEl) liveEl.textContent = model.snapshot().text;
        scrollToBottom();
      },
      seal() {
        if (model.snapshot().sealed || !container) return;
        model.seal();
        container.innerHTML = "";
        container.dataset.expanded = "false";
        const summary = document.createElement("button");
        summary.type = "button";
        summary.className = "ucw-reasoning-summary";
        summary.innerHTML = `${ICONS.chevron}<span>Thoughts</span>`;
        const body = document.createElement("div");
        body.className = "ucw-reasoning-body";
        body.textContent = model.snapshot().text;
        summary.addEventListener("click", () => {
          const expanded = container!.dataset.expanded === "true";
          container!.dataset.expanded = expanded ? "false" : "true";
        });
        container.appendChild(summary);
        container.appendChild(body);
      },
    };
  }

  /** Collapsed reasoning disclosure for a finalized message in history. */
  function buildHistoryReasoning(text: string): HTMLDivElement {
    const container = document.createElement("div");
    container.className = "ucw-reasoning";
    container.dataset.expanded = "false";
    const summary = document.createElement("button");
    summary.type = "button";
    summary.className = "ucw-reasoning-summary";
    summary.innerHTML = `${ICONS.chevron}<span>Thoughts</span>`;
    const bodyEl = document.createElement("div");
    bodyEl.className = "ucw-reasoning-body";
    bodyEl.textContent = text;
    summary.addEventListener("click", () => {
      const expanded = container.dataset.expanded === "true";
      container.dataset.expanded = expanded ? "false" : "true";
    });
    container.appendChild(summary);
    container.appendChild(bodyEl);
    return container;
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
    // Always force a fresh thread when we reach this point. The two
    // paths into here are (a) the visitor never had a cached thread,
    // and (b) the cached one was invalid — in either case the
    // visitor's expectation is "I'm starting something new." Without
    // `force_new`, the server quietly resumes the visitor's latest
    // existing thread, which makes the widget feel like it's
    // dropping people into a conversation they don't remember.
    // Visitors who want to resume a past thread pick it from the
    // dropdown (that path uses `switchToThread`, not this one).
    const createBody: {
      force_new?: boolean;
      vars?: WidgetVars;
      collections?: string[];
    } = {
      force_new: true,
    };
    if (state.currentVars) createBody.vars = state.currentVars;
    if (state.currentCollections) createBody.collections = state.currentCollections;
    const result = await transport.createOrResumeThread(createBody);
    state.forceNewOnNextCreate = false;
    state.threadId = result.thread_id;
    if (config.behavior.persistAcrossSessions) {
      saveThread(widgetToken, state.userId, result.thread_id);
    }
    return result.thread_id;
  }

  function renderHistory(messages: ServerMessage[]) {
    // Every caller has just emptied the transcript.
    disposeComponents();
    shownFileVersions.clear();
    fileLists.length = 0;
    renderHistoryMessages(messages);
    syncArchiveButton();
  }

  function renderHistoryMessages(messages: ServerMessage[]) {
    for (const m of messages) {
      if (m.role === "user") {
        const atts: RenderableAttachment[] = (m.attachments ?? []).map((a) => ({
          kind: "remote",
          messageId: m.id,
          attachment: a,
        }));
        appendUserBubble(m.content, atts);
      } else if (
        m.role === "assistant" &&
        (m.content || m.files?.length || m.components?.length)
      ) {
        // Pass per-message tool-call summaries so <urai-tool-call>
        // markers render as visible chips with the LLM-generated
        // label rather than vanishing silently.
        const bubble = appendAssistantText(
          m.content,
          m.tool_call_summaries ?? undefined,
        );
        if (m.components?.length) {
          const components = makeComponentList(bubble);
          for (const c of m.components) components.add(c);
        }
        if (m.files?.length) {
          const list = makeFileList(bubble, m.thread_id);
          list.set(m.files);
          fileLists.push(list);
          for (const f of m.files) shownFileVersions.set(f.path, fileVersion(f));
        }
        // Prepend the collapsed reasoning disclosure if the model
        // produced a thought summary on this turn. Same shape as the
        // post-stream sealed state.
        if (m.reasoning && m.reasoning.trim().length > 0) {
          bubble.prepend(buildHistoryReasoning(m.reasoning));
        }
      }
    }
  }

  async function submit() {
    if (destroyed) return;
    const text = textarea.value.trim();
    if (state.isSending) return;

    const hasPending = pendingAttachments.length > 0;
    if (!text && !hasPending) return;

    // Wait for in-flight uploads. The upload endpoint enforces the 50MB
    // body cap and fails fast, so we don't add a parallel timeout here.
    if (hasPending && pendingAttachments.some((p) => p.status === "uploading")) {
      setSending(true);
      while (pendingAttachments.some((p) => p.status === "uploading")) {
        await new Promise((r) => setTimeout(r, 50));
        if (destroyed) return;
      }
      setSending(false);
    }

    const ready = pendingAttachments.filter(
      (p): p is PendingAttachment & { uploaded: WidgetAttachment } =>
        p.status === "ready" && !!p.uploaded,
    );
    if (!text && ready.length === 0) {
      if (pendingAttachments.some((p) => p.status === "error")) {
        appendError("Attachment upload failed");
      }
      return;
    }

    const renderable: RenderableAttachment[] = ready.map((p) => ({
      kind: "local",
      file: p.file,
      mimeType: p.mimeType,
      fileName: p.fileName,
    }));
    const uploadedDescriptors = ready.map((p) => p.uploaded);

    textarea.value = "";
    autosize();
    clearSuggested();
    clearPendingAttachments();
    appendUserBubble(text, renderable);
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
    const thinking = appendThinking();
    try {
      const threadId = await ensureThread();
      // Current vars ride along on every send — see `transport.sendMessage`.
      const send = await transport.sendMessage(
        threadId,
        text,
        uploadedDescriptors,
        state.currentVars,
      );
      if (destroyed) return;
      // Build the bubble but don't attach it yet — the thinking pill
      // stays until the first real model output (chunk OR reasoning).
      const bubble = document.createElement("div");
      bubble.className = "ucw-bubble ucw-assistant";
      // Stream into a dedicated content child so reasoning + tool
      // activity rows sitting alongside it survive each markdown
      // re-render.
      const contentEl = document.createElement("div");
      bubble.appendChild(contentEl);
      const tools = makeToolActivityTracker(bubble);
      const reasoning = makeReasoningSection(bubble);
      const files = makeFileList(bubble, threadId);
      const components = makeComponentList(bubble);
      let bubbleAttached = false;
      let buf = "";

      const onFirstSignal = () => {
        if (bubbleAttached) return;
        bubbleAttached = true;
        thinking.remove();
        body.appendChild(bubble);
        scrollToBottom();
      };

      activeStreamClose = transport.streamMessage(send.assistant_message_id, {
        onChunk(chunk) {
          if (destroyed) return;
          onFirstSignal();
          if (!buf) reasoning.seal();
          buf += chunk;
          contentEl.innerHTML = renderMd(buf);
          scrollToBottom();
        },
        onReasoning(chunk) {
          if (destroyed) return;
          onFirstSignal();
          reasoning.append(chunk);
        },
        onCommand(command) {
          emit({ type: "command", command });
          const component = parseDisplayComponent(command);
          if (!component || destroyed) return;
          onFirstSignal();
          components.add(component);
        },
        onToolCallStarted({ id, fn_name }) {
          if (destroyed) return;
          onFirstSignal();
          tools.start(id, fn_name);
        },
        onToolCallCompleted({ id, files: listing }) {
          if (destroyed) return;
          tools.complete(id);
          // Each listing is the whole workspace: it replaces the row.
          if (listing) {
            onFirstSignal();
            const fresh = freshFiles(listing, shownFileVersions);
            files.set(fresh);
            if (fresh.length > 0) syncArchiveButton(true);
          }
        },
        onToolCallSummary({ id, summary }) {
          if (destroyed) return;
          tools.setSummary(id, summary);
        },
        onComplete(msg) {
          if (destroyed) return;
          onFirstSignal();
          if (msg?.content) {
            reasoning.seal();
            buf = msg.content;
            contentEl.innerHTML = renderMd(buf);
            scrollToBottom();
          }
        },
        onDone() {
          activeStreamClose = null;
          if (destroyed) return;
          // Race guard: reasoning-only turns still need a visible bubble.
          onFirstSignal();
          tools.clear();
          // What this turn rewrote moves here from earlier messages.
          const moved = new Set(files.files.map((f) => f.path));
          if (moved.size > 0) {
            for (const list of fileLists) {
              if (list.files.some((f) => moved.has(f.path))) {
                list.set(list.files.filter((f) => !moved.has(f.path)));
              }
            }
            fileLists.push(files);
          }
          for (const f of files.files) shownFileVersions.set(f.path, fileVersion(f));
          emit({ type: "assistant-reply", content: buf });
          setSending(false);
        },
        onError(err) {
          activeStreamClose = null;
          if (destroyed) return;
          tools.clear();
          thinking.remove();
          appendError(err);
          emit({ type: "error", error: err });
          setSending(false);
        },
      });
    } catch (e: unknown) {
      thinking.remove();
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
      bubble.innerHTML = renderMd(reply.slice(0, i));
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
   * Restore the thread this visitor was last on **in the same
   * browser/tab session** (via localStorage when
   * `persistAcrossSessions` is enabled). We deliberately do NOT fall
   * back to the visitor's most-recent server thread: opening the
   * widget after a long gap should feel like a fresh conversation,
   * not a continuation of something the visitor might not remember
   * starting.
   *
   * Idempotent — fires at mount (so inline-mode widgets get their
   * thread loaded and floating-mode widgets preload before the
   * visitor clicks the button) and again on `open()` as a race
   * backstop. `state.threadId` guard makes repeats no-ops.
   *
   * `cachedThreads` is preloaded as a side effect for the dropdown,
   * but we no longer gate the resume decision on it: `listMessages`
   * is the existence check, and a `listThreads` network blip used to
   * incorrectly clear the cache and drop visitors to the welcome
   * screen.
   */
  async function autoRestoreOnOpen() {
    if (!transport || destroyed) return;
    if (state.threadId) return;
    if (state.forceNewOnNextCreate) return;
    if (!config.behavior.persistAcrossSessions) return;
    const cachedId = loadThread(widgetToken, state.userId);
    if (!cachedId) return;
    // Note: we no longer warm `cachedThreads` here. The dropdown
    // does its own fetch on first open, so doing it at mount was
    // just a wasted round-trip for visitors who never open the
    // switcher — and was breaking opt-outs like `fetchServerConfig:
    // false` that expect zero network at mount.
    try {
      const msgs = await transport.listMessages(cachedId);
      if (destroyed) return;
      state.threadId = cachedId;
      body.innerHTML = "";
      clearSuggested();
      renderHistory(msgs);
    } catch {
      clearThread(widgetToken, state.userId);
    }
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
    clearPendingAttachments();
    revokeAttachmentObjectUrls();
    disposeComponents();
    shownFileVersions.clear();
    fileLists.length = 0;
    syncArchiveButton();
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
      clearPendingAttachments();
      revokeAttachmentObjectUrls();
      disposeComponents();
      shownFileVersions.clear();
      fileLists.length = 0;
      syncArchiveButton();
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

  /**
   * Scope this conversation's knowledge search to `collections` (ids), on top
   * of whatever the assistant already carries. Same buffering rule as
   * `setVars`: with a live thread it patches the server, with none yet it is
   * held for the next lazy create.
   */
  function setCollections(collections: string[] | null) {
    state.currentCollections = collections;
    if (transport && state.threadId && !previewMode) {
      void transport
        .updateThreadCollections(state.threadId, collections)
        .catch((e) => console.warn("[UraiChat] setCollections patch:", e));
    }
  }

  function startConversation(arg?: StartConversationArg) {
    // Buffer the vars so the next thread creation picks them up. We
    // don't hit the server now — the thread is created lazily on the
    // first message, which keeps "every navigation calls
    // startConversation" cheap.
    const opts = asStartOptions(arg);
    if (opts.vars !== undefined) state.currentVars = opts.vars;
    if (opts.collections !== undefined) state.currentCollections = opts.collections;
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

  // Restore the previous thread at mount, not just on `open()`. This
  // covers two cases the open-only hook missed:
  //   1. Inline mode never calls `open()`, so without this an inline
  //      widget would always show the welcome screen on mount even
  //      with a valid localStorage cache.
  //   2. Floating mode users get history preloaded BEFORE they click
  //      the button — no welcome-to-history flicker.
  // The `state.threadId` guard inside `autoRestoreOnOpen` makes the
  // later `open()` call a safe no-op.
  void autoRestoreOnOpen();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    closeActiveStream();
    if (previewTimer !== null) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
    revokeAttachmentObjectUrls();
    disposeComponents();
    hostElement.remove();
  }

  function sendMessageAsVisitor(text: string) {
    textarea.value = text;
    void submit();
  }

  return {
    open,
    close,
    toggle,
    sendMessage: sendMessageAsVisitor,
    reset,
    setUser,
    setVars,
    setCollections,
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
