<script setup lang="ts">
/**
 * A component a tool can put in the reply. The host owns it entirely — the
 * chat only ever learns its *name* and a JSON object, which is the whole
 * security story: nothing crosses that is executable.
 *
 * A tool asks for it with:
 *
 *   await meta.urai.sendCommand(meta.vars.thread_id, {
 *     command: "displayComponent",
 *     component: "OrderCard",
 *     props: { orderId: "o-1", status: "shipped", total: "$42.00" },
 *   });
 *
 * The tool's props arrive as ONE object, `props` — never spread, so a tool
 * cannot set `class`, `key` or a listener on this component. It is tool
 * output, so the type is a claim rather than a check: read defensively.
 */
import { computed } from "vue";
import { displayComponentPropsOptions } from "@uraiai/chat-widget-vue/ui";

// `{ props, component, sendMessage }`, declared so none of them falls
// through to the root element as an attribute.
const p = defineProps(displayComponentPropsOptions);

const orderId = computed(() =>
  typeof p.props.orderId === "string" ? p.props.orderId : "unknown",
);
const status = computed(() =>
  typeof p.props.status === "string" ? p.props.status : "pending",
);
const total = computed(() => (typeof p.props.total === "string" ? p.props.total : null));
</script>

<template>
  <div class="demo-order-card">
    <div class="demo-order-head">
      <strong>Order {{ orderId }}</strong>
      <span :class="['demo-order-status', `is-${status}`]">{{ status }}</span>
    </div>
    <div v-if="total" class="demo-order-total">{{ total }}</div>
    <!-- The visitor replying through the component is the point of
         `sendMessage` — the conversation continues rather than forking off
         into the host app. -->
    <button type="button" @click="sendMessage(`Where is order ${orderId}?`)">
      Track this order
    </button>
  </div>
</template>
