---
"@uraiai/chat-widget-core": patch
---

Recover a reply whose stream never ends. If the message stream opens after the turn has already finished on the server, no `complete` or `done` arrives. While a turn streams, the store now checks the thread's history every 5 seconds (`turnPollMs`). Once the finished reply is there, it closes the stream, reloads the transcript and ends the turn.
