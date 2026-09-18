# The demo agent

The `displayComponents` half of this demo needs something on the other end. A
component only ever appears because a **tool asked for it** — there is no host
API for faking one, by design — so to see `OrderCard` render you need an agent
that sends the command.

This directory is that agent:

```
SYSTEM_PROMPT.md   paste into the assistant's system instructions
show_order.js      the script the agent ends up writing, for reading
```

## Setting it up

1. **Create an assistant** in the Urai app, in **agent mode**. Chat mode works
   too if you attach a remote tool that sends the command, but agent mode needs
   nothing but the prompt — the agent writes and runs its own script.
2. Paste `SYSTEM_PROMPT.md` into its system instructions.
3. **Create a widget** on that assistant and copy the token into
   `VITE_URAI_WIDGET_TOKEN`.
4. Add `http://localhost:5178` to the widget's **allowed origins** (Security
   tab). Widget auth is `(token, Origin ∈ allowed_origins)` — skip this and
   every request 403s.

No secrets, no API, no library to publish. The order book lives in the prompt.

## Trying it

> where is order o-1042?

The agent writes a script like `show_order.js`, runs it, and answers in a line
or two. The card appears beneath the reply, rendered by the `OrderCard` in
`../src/App.tsx` — your component, your CSS, in the middle of the conversation.

Things worth doing once:

- **Click *Track this order*.** The card calls `sendMessage`, so the visitor
  replies through your UI and the conversation carries on.
- **Reload the page.** The card is still there. chat-service stored the command
  against the assistant message, which is the one way `displayComponent`
  differs from every other command.
- **Watch the Events panel.** `command:` fires for the raw payload as well —
  `onCommand` still sees everything, component or not.
- **Ask it to show you a broken component.** `BrokenCard` throws on purpose;
  the error boundary removes it and leaves the conversation standing. The
  failure is in the console, named.
- **Ask about `o-9999`.** The prompt tells the agent not to invent a card for
  an order it does not have, so you get prose and no card. Worth seeing,
  because "the model made up props" is the failure mode this kind of prompt is
  guarding against.

## Writing your own

Two things have to line up, and nothing checks them for you:

- the **names** the prompt tells the agent about, and the keys in the
  `displayComponents` object on `<UraiChat>`;
- the **props** the prompt describes, and what your component reads.

There is no server-side catalogue of components — chat-service validates the
*shape* of a command, never whether a name exists or whether its props make
sense. That is what keeps the boundary small, and it is why the contract lives
in the prompt (or in the library a tool imports) rather than in a schema
somewhere. Treat `props` as untrusted in the component: it is model output.

When a name does not line up you get silence plus one console warning, which is
the right failure for a rollout where the tool ships before the page does — but
it does mean a typo is quiet. Check the console first.
