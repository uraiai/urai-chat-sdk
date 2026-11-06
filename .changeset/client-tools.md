---
"@uraiai/chat-widget-core": minor
"@uraiai/chat-widget-react": minor
"@uraiai/chat-widget-vue": minor
"@uraiai/chat-widget-svelte": minor
---

Let the agent call tools that your app runs: a new `clientTools` option.

Declare a tool with a name, a description written for the model, a JSON Schema and a
handler. The agent can then call it mid-turn and wait for the result. A tool can open a
record in your UI, read the visitor's cart, or apply a filter.

```tsx
<UraiChat
  widgetToken={token}
  userId={visitorId}
  clientTools={{
    host: "acme-crm",
    tools: [
      {
        name: "open_ticket",
        description: "Open a support ticket in the app so the user can see it.",
        parameters: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        handler: async ({ id }, { signal }) => {
          router.push(`/tickets/${id}`);
          return { opened: id };
        },
      },
    ],
    // Optional review before each `write` tool runs: an Allow / Decline card
    // inline in the reply. Or pass a function to use your own UI.
    approve: "inline",
  }}
/>
```

How it works:

- Every send carries the declarations, never the handlers, as the message's `client`
  hello.
- A call arrives on the turn's stream as `client_tool_call`.
- The SDK **claims** the call before running it, so the same chat open in two tabs, or a
  reconnect that replays the event, never runs a call twice.
- The handler's return value goes back to the agent as the tool result. A throw becomes
  an error result, and a declined `approve` becomes a `rejected` result.
- Stop and destroy abort a running handler through `ctx.signal`.
- `effect: "read"` tools skip `approve`. Tools default to `"write"`.
- With `approve: "inline"` the chat shows an **Allow / Decline card** as its own row
  after the streaming reply, so a replaced `StreamingMessage` slot can't hide it. It's
  drawn in the React and Vue `/ui` chats and in the floating widget. Stop or destroy
  declines any open card, so the agent never waits on one nobody can answer. The card is
  a new `ToolApproval` slot (`DefaultToolApproval`, `ToolApprovalSlotProps`) with the
  labels `approvalTitle`, `approvalAllow`, `approvalDecline` and `approvalDetails`, and
  the `toolApproval` class-name key. Headless: `state.approvals` plus
  `actions.approveToolCall(id)` / `actions.declineToolCall(id, note?)`.

`clientTools` is read live: a re-render with new handlers takes effect on the next call
without remounting the chat. The core option also accepts a function returning the
current tools.

Requirements:

- A chat-service with client tools.
- The widget's **"Allow tools declared by the embedding page"** setting turned on
  (`client_tools = "declared"`).
- An agent-mode assistant.

Otherwise the declarations are ignored and no call arrives. Names must be lowercase
letters, digits and `_` (at most 48). The prefixes `doc_`, `sheet_`, `slide_` and
`browser_` are reserved. A name a server tool already uses is dropped.

Nothing changes for hosts that don't pass `clientTools`. `sendCommand` /
`displayComponent` behave exactly as before: the `command` event and component rendering
are untouched, and a test now pins that.

New API:

- core: the `clientTools` option on `createUraiChatWidget` and `createChatClient`, the
  `ClientToolsOptions` / `ClientToolDeclaration` / `ClientToolCall` / `ClientToolContext` /
  `ClientToolApproval` / `ClientToolEffect` types, and on `Transport`: `claimToolCall` /
  `postToolCallResult`, a `client` argument to `sendMessage`, and an `onClientToolCall`
  stream handler.
- headless: `createClientToolRunner`, `clientHello` and `parseClientToolCall`.
- React (`<UraiChat>` and `<UraiChatWidget>`), Vue and Svelte: a `clientTools` prop, with
  the types re-exported.
