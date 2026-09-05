---
"@uraiai/chat-widget-core": patch
---

Render raw, unfenced `<svg>` in assistant messages.

The agent writes charts as bare `<svg>` in the message body rather than inside a
```svg fence. Only fenced SVG was lifted out ahead of the markdown pass, so raw
markup reached DOMPurify's HTML profile, which drops the whole subtree — the
widget showed nothing at all, while the same message rendered fine in the chat
app (react-markdown parses raw HTML straight into the tree). Raw `<svg>` is now
extracted and sanitized with the SVG profile alongside fenced blocks, with the
same pending placeholder while a document is still streaming. Nested `<svg>`
elements close correctly, and SVG quoted inside a non-SVG fence still renders as
code.

Also fixes `stripJsActionFences` ending a code action at the first ``` it finds
anywhere. A line like ```svg carries an info string, so CommonMark treats it as
opening a block rather than closing the fence; the strip now scans line-wise for
a bare closing fence. Previously a code action containing its own fence spilled
its tail into the visible prose, where the sanitizer happened to hide it — with
raw SVG rendering, it would have become visible.
