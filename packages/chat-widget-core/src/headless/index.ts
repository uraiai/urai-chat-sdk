/**
 * The headless half of the widget: framework-agnostic, DOM-free models
 * shared by the imperative `ui.ts` view and (from a later phase) a React
 * one. Nothing in here touches `document`, `window`, `fetch` or storage.
 *
 * Not a published entry point yet — `ui.ts` and `theme.ts` import it
 * relatively. It gains a `./headless` export once the store lands.
 */
export {
  createToolActivity,
  prettyToolName,
  type ToolActivityEntry,
  type ToolActivityModel,
  type ToolActivitySnapshot,
} from "./tool-activity";

export {
  createReasoning,
  type ReasoningModel,
  type ReasoningSnapshot,
} from "./reasoning";

export {
  filterThreads,
  groupByRecency,
  relativeTime,
  type ThreadGroup,
} from "./thread-list";

export {
  resolveDarkMode,
  themeToCssVars,
  VAR_PREFIX,
} from "./theme-vars";

export {
  resolveLayers,
  type ConfigLayers,
} from "./config-layers";

export type { ChatTransport } from "./transport-port";

export {
  createChatStore,
  type ChatActions,
  type ChatStore,
  type ChatStoreDeps,
} from "./store";

export {
  createChatClient,
  DEFAULT_BASE_URL,
  type ChatClient,
  type ChatClientOptions,
} from "./client";

export {
  createSessionStore,
  createNullSessionStore,
  type SessionStore,
} from "./persistence";

export { hydrateHistory, commitStream } from "./messages";

export type {
  ChatAttachment,
  ChatMessage,
  ChatState,
  ChatStatus,
  MessageRole,
  PendingAttachment,
  StreamSlice,
  ThreadListState,
  ToolActivity,
  WidgetVars,
} from "./types";

export type {
  ServerMessage,
  ThreadSummary,
  WidgetAttachment,
  WidgetMessageAttachment,
} from "../transport";
