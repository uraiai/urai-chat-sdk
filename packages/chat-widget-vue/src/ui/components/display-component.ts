import {
  defineComponent,
  h,
  onErrorCaptured,
  ref,
  type Component,
  type PropType,
} from "vue";
import type { MessageComponent } from "@uraiai/chat-widget-core/headless";
import { useChatActions, usePresentation } from "../context";
import type { UraiChatDisplayComponents } from "./registry";

/** Names already warned about, so a missing component logs once. */
const warnedMissing = new Set<string>();

/**
 * The host's component for `name`, as an own property only — a tool naming
 * `constructor` or `toString` must not reach `Object.prototype`.
 */
export function lookupDisplayComponent(
  registry: UraiChatDisplayComponents,
  name: string,
): Component | undefined {
  return Object.prototype.hasOwnProperty.call(registry, name)
    ? registry[name]
    : undefined;
}

/**
 * Prop declarations for a registered display component, so the three props
 * it receives are declared rather than falling through to its root element
 * as attributes:
 *
 *   defineComponent({ props: displayComponentPropsOptions, setup(p) { … } })
 *
 * In `<script setup>`: `defineProps(displayComponentPropsOptions)`.
 */
export const displayComponentPropsOptions = {
  props: { type: Object as PropType<Record<string, unknown>>, required: true },
  component: { type: String, required: true },
  sendMessage: { type: Function as PropType<(text: string) => void>, required: true },
} as const;

/**
 * Contains a host component that throws — in setup, in render, or in a
 * lifecycle hook — so one bad card cannot unmount the conversation around
 * it. The failed component renders nothing; the error is logged and does
 * not propagate to the app's error handler.
 */
export const DisplayComponentBoundary = defineComponent({
  name: "UraiDisplayComponentBoundary",
  props: { name: { type: String, required: true } },
  setup(props, { slots }) {
    const failed = ref(false);
    onErrorCaptured((error, _instance, info) => {
      console.error(
        `[UraiChat] component "${props.name}" failed to render:`,
        error,
        info,
      );
      failed.value = true;
      return false;
    });
    return () => (failed.value ? null : slots.default?.());
  },
});

/**
 * One component a tool asked for, drawn with what the host registered under
 * its name. Nothing registered renders nothing. The tool's `props` arrive as
 * a single `props` object rather than spread, so a tool cannot set `key`,
 * `ref`, `class` or anything else Vue treats specially.
 */
export const DisplayComponent = defineComponent({
  name: "UraiDisplayComponent",
  props: {
    item: { type: Object as PropType<MessageComponent>, required: true },
  },
  setup(props) {
    const presentation = usePresentation();
    const actions = useChatActions();
    const sendMessage = (text: string) => void actions.send(text);
    return () => {
      const { item } = props;
      const Registered = lookupDisplayComponent(
        presentation.displayComponents,
        item.component,
      );
      if (!Registered) {
        if (!warnedMissing.has(item.component)) {
          warnedMissing.add(item.component);
          console.warn(`[UraiChat] no component registered for "${item.component}"`);
        }
        return null;
      }
      return h(
        DisplayComponentBoundary,
        { name: item.component },
        {
          default: () =>
            h(Registered, {
              props: item.props,
              component: item.component,
              sendMessage,
            }),
        },
      );
    };
  },
});
