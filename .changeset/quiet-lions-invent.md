---
"@uraiai/chat-widget-core": patch
---

Add a `ChatTransport` port — the interface the headless models depend on, which the
concrete `Transport` satisfies structurally. A constrained type alias asserts that at
compile time, so adding a method to `Transport` without updating the port (or letting a
signature drift) fails `tsc` rather than surfacing later as a confusing test failure.

Internal only; no runtime code and no public API change.
