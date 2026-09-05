/**
 * The state vocabulary shared by every view. No logic lives here.
 */
import type { ResolvedConfig } from "../config";
import type {
  ThreadSummary,
  WidgetAttachment,
  WidgetMessageAttachment,
} from "../transport";

export type WidgetVars = Record<string, unknown>;

export type MessageRole = "user" | "assistant" | "error";

/**
 * An attachment as a view needs it. `local` still holds the `File`, so a
 * just-sent message can preview from the local blob instead of
 * round-tripping through the download endpoint; `remote` has to be
 * fetched with the visitor header.
 */
export type ChatAttachment =
  | {
      kind: "local";
      fileName: string;
      mimeType: string;
      file: File;
    }
  | {
      kind: "remote";
      messageId: string;
      attachment: WidgetMessageAttachment;
    };

export interface ChatMessage {
  /** Server id, or `local:N` for an optimistic or error row. */
  id: string;
  role: MessageRole;
  content: string;
  /** Model thought summary, when the turn produced one. */
  reasoning: string | null;
  attachments: ChatAttachment[];
  /**
   * `<urai-tool-call id>` markers in `content` resolve against this.
   * Server-generated, and may arrive after the turn completes.
   */
  toolSummaries?: Record<string, string>;
}

/**
 * In-composer state for a file the visitor picked. Stays "uploading"
 * until the server returns a bucket_path; on success it carries the
 * descriptor to send with the next message. Errors surface on the chip
 * and never block removing it or picking new files.
 */
export interface PendingAttachment {
  localId: number;
  fileName: string;
  mimeType: string;
  file: File;
  status: "uploading" | "ready" | "error";
  errorMessage?: string;
  uploaded?: WidgetAttachment;
}

/** The most recent tool call, as the activity row shows it. */
export interface ToolActivity {
  label: string;
  completed: boolean;
}

/**
 * The in-flight turn. Deliberately a slice of its own: during streaming
 * only this object changes, so `messages` keeps its identity and a
 * memoized message row never re-renders mid-stream.
 */
export interface StreamSlice {
  /** Server id of the assistant message being streamed. */
  messageId: string;
  content: string;
  reasoning: { text: string; sealed: boolean } | null;
  tool: ToolActivity | null;
  /**
   * False until the first real model output. Views show a "thinking"
   * placeholder instead of an empty bubble while this is false.
   */
  attached: boolean;
}

export type ChatStatus = "idle" | "sending" | "streaming";

export interface ThreadListState {
  /** `null` means "never loaded" — distinct from "loaded and empty". */
  items: ThreadSummary[] | null;
  query: string;
  loading: boolean;
}

export interface ChatState {
  config: ResolvedConfig;
  userId: string;
  vars: WidgetVars | null;

  threadId: string | null;
  /**
   * Set by user-initiated reset paths. Read **only** by thread
   * auto-restore, to stop it snapping back to the previous conversation.
   * It does not gate `force_new` on create — that is always true.
   */
  forceNewOnNextCreate: boolean;

  messages: ChatMessage[];
  stream: StreamSlice | null;

  draft: string;
  attachments: PendingAttachment[];
  status: ChatStatus;

  threads: ThreadListState;
  /** Last error surfaced to the view, if it was not turned into a message. */
  error: string | null;
}
