---
"@uraiai/chat-widget-core": minor
"@uraiai/chat-widget-react": minor
---

Sign in as a member, for Urai's own add-ons: a new `bearer` option, plus `storageKey` and a Stop button.

```tsx
<UraiChat
  baseUrl={instance}
  bearer={{
    agentId,
    getToken: () => session.token,
    refreshToken: () => reconnect(), // a fresh token after a 401, or null
    threadRef: { ref: docId, title: docTitle },
  }}
  clientTools={docTools}
/>
```

- **`bearer`** replaces `widgetToken` and `userId`. The chat then talks to
  chat-service's member API, `/api/client/v1`, with
  `Authorization: Bearer <session>`. Config and the thread list are the
  agent's. New threads attach to `threadRef`, for Google Docs the open
  document, and the list is filtered by it. Every send, client tool call
  and file fetch uses the same wire format as the widget.
- A request that comes back 401 calls `refreshToken()` once and retries with
  the new token.
- **`storageKey`** names where the current thread id is remembered. With
  `bearer` it defaults to the agent and thread ref.
- **Stop:** the store has a new `actions.stopTurn()` and `state.canStop`, and
  `ChatTransport` has an optional `stopTurn(threadId)`. While a reply runs on
  a transport that can stop it, the React `/ui` send button becomes a Stop
  button. It uses the `stop` icon and label, and `SendButtonSlotProps` gains
  `canStop`. Stopping also declines any open approval card and aborts
  running client tools.

Nothing changes for widget hosts. `widgetToken` and `userId` behave as
before, the requests are byte-for-byte the same, and the widget transport
has no `stopTurn`, so no Stop button appears.

**Client tool calls survive a buffering proxy.** While a turn runs, the store
already polls the transcript every 5 s; the running row now lists the calls
still waiting for a client (`ServerMessage.client_calls`), and the store runs
them from there too. The stream and the poll may both deliver a call: the
runner skips one it has seen and the server lets one claim win. A Cloudflare
quick tunnel, for one, holds the whole event stream back until the turn ends,
which used to make every client tool time out as "not connected".

**Built-in tool families.** `clientTools.families` (e.g. `["document@1"]`) names
families the host implements. chat-service supplies those tools' declarations
and prompt, and only for Urai's own member hosts; tools with a family prefix
(`doc_`, `sheet_`, `slide_`, `browser_`) are sent as handlers only, never as
declarations. Widget hosts are unaffected.

New API:

- core: `ClientToolsOptions.families`, the `BearerAuth` and `ThreadRef` types, `TransportOptions.bearer`,
  `ChatClientOptions.bearer` / `storageKey`, `Transport.stopTurn`,
  `ChatTransport.stopTurn?`, `ChatActions.stopTurn` and `ChatState.canStop`.
- React: an `icons.threads` icon for the header's conversation switcher (the
  chevron by default, so nothing changes unless you set it), the `bearer` and
  `storageKey` props on `<UraiChat>`, and
  `canStop` / `stop` on `useComposer()`.
