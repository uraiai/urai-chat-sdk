---
"@uraiai/chat-widget-core": minor
---

Pick up a reply that is still being written when a conversation loads.

Reloading the page, reopening the widget or switching to a thread mid-reply used to show
the visitor's message with no answer under it, until the next history load. Now the
widget re-attaches to the running turn: it replays everything the reply has produced so
far (text, reasoning, tool activity, sub-agent cards, components) and then streams the
rest live, as if the visitor had watched it from the start.

A dropped connection no longer leaves a hole in the reply either. Every stream event
carries an id, so the browser's own reconnect resumes after the last one it saw.

Commands a tool sent before the stream opened are replayed to rebuild their
`displayComponent`s, but are **not** emitted as `command` events again, so a reload never
re-fires a host-page action such as `navigate`.

New API:

- core: `ServerMessage.streaming` and `ServerMessage.stream_url`, set on the row whose
  turn is still running.
- core: an optional third `streamUrl` argument to `Transport.streamMessage` (and to
  `ChatTransport.streamMessage`). Pass the server's `stream_url` when there is one: it
  carries a ticket that scopes the stream to the visitor, and only with it does the
  stream replay. A custom `ChatTransport` that ignores it keeps working, live-only.
- core: an `onCommandReplay` stream handler.

Re-attaching needs a chat-service that marks running rows and issues stream tickets.
Against an older one nothing changes.
