---
"@uraiai/chat-widget-core": minor
"@uraiai/chat-widget-react": minor
"@uraiai/chat-widget-vue": minor
"@uraiai/chat-widget-svelte": minor
---

Show a card for each sub-agent the assistant hands a task to.

When an agent turn calls the `delegate` tool, the reply now carries a small **Sub-agent**
card below its text: the task's first line, a status — a spinner while it runs, then
Done, No result file, Failed, Timed out, Stopped or Error — and, from history, how many
steps it took. The card never links to the sub-agent's thread and shows no cost or answer
text. Cards appear live from the stream's tool-call events and come back from history via
the new `ServerMessage.delegates`.

Core adds `MessageDelegate`/`DelegateStatus`, `label` on `tool_call_started` and `status`
on `tool_call_completed`, and headless helpers (`createDelegateList`,
`delegateStatusLabel`, `delegateStepsLabel`, …); `ChatMessage.delegates` and
`StreamSlice.delegates` carry the cards in the store. React adds a `DelegateList` slot
(`DefaultDelegateList`), `delegates` on the message slot props, the `delegateList` /
`delegate` class names and the `subAgent`, `subAgents`, `delegateStatus` and
`delegateSteps` labels. Vue and Svelte render the cards through the core widget.
