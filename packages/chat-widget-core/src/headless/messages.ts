/**
 * Pure message helpers: turning server history into view rows, and
 * building the optimistic rows a turn produces.
 */
import type { ServerMessage } from "../transport";
import type { ChatAttachment, ChatMessage, StreamSlice } from "./types";

/**
 * Server history → view rows. System messages are dropped, and an
 * assistant turn with no content, files or components is skipped: it
 * carries nothing to show.
 */
export function hydrateHistory(messages: ServerMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({
        id: m.id,
        role: "user",
        content: m.content,
        reasoning: null,
        attachments: (m.attachments ?? []).map(
          (a): ChatAttachment => ({
            kind: "remote",
            messageId: m.id,
            attachment: a,
          }),
        ),
      });
    } else if (
      m.role === "assistant" &&
      (m.content || m.files?.length || m.components?.length)
    ) {
      out.push({
        id: m.id,
        role: "assistant",
        content: m.content,
        reasoning:
          m.reasoning && m.reasoning.trim().length > 0 ? m.reasoning : null,
        attachments: [],
        toolSummaries: m.tool_call_summaries ?? undefined,
        files: m.files?.length ? m.files : undefined,
        components: m.components?.length ? m.components : undefined,
      });
    }
  }
  return out;
}

/** The finalized assistant row a completed stream leaves behind. */
export function commitStream(stream: StreamSlice): ChatMessage {
  return {
    id: stream.messageId,
    role: "assistant",
    content: stream.content,
    reasoning: stream.reasoning?.text ? stream.reasoning.text : null,
    attachments: [],
    files: stream.files.length > 0 ? stream.files : undefined,
    components: stream.components.length > 0 ? stream.components : undefined,
  };
}
