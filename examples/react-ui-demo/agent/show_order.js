// show_order.js — what the demo agent writes and executes to put an OrderCard
// in its reply. Reproduced here so you can read it without going through the
// agent; the prompt in SYSTEM_PROMPT.md teaches the same shape.
//
// Two things make this work, and both are worth noticing:
//
//   1. Nothing renderable crosses the boundary. The script sends a *name* and
//      a JSON object. `OrderCard` is the host page's own React component,
//      registered in App.tsx under exactly that key; the script cannot reach
//      it, replace it, or style it.
//
//   2. The command is addressed to `meta.vars.thread_id`. That is how the
//      relay knows which conversation — and which assistant message — the
//      component belongs to, which is also what makes it come back on reload.

const ORDERS = {
  "o-1042": { status: "shipped", total: "$42.00" },
  "o-1043": { status: "pending", total: "$128.50" },
  "o-1044": { status: "delivered", total: "$19.99" },
};

// The agent inlines the order it is talking about; `execute(name)` takes no
// arguments, so a script that needs an input carries it in its own source and
// is rewritten per turn.
const orderId = "o-1042";

const order = ORDERS[orderId];
if (!order) {
  // No card for an order that does not exist — better to say so in prose than
  // to show a card full of nulls.
  await urai.complete({ shown: null, reason: `no such order: ${orderId}` });
} else {
  await meta.urai.sendCommand(meta.vars.thread_id, {
    command: "displayComponent",
    component: "OrderCard",
    props: { orderId, ...order },
  });

  // The observation the agent reads next. Deliberately a receipt rather than
  // the order itself: the model already knows what it sent, and repeating the
  // payload here only tempts it into restating the card in prose.
  await urai.complete({ shown: "OrderCard", orderId });
}
