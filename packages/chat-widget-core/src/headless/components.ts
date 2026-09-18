/**
 * Rich components — UI a uraiJS tool asks the chat to show on the reply,
 * rendered by code the host registered under a name.
 *
 * DOM-free and shared by every view, so the imperative widget and the
 * React one accept exactly the same commands. The rules mirror the ones
 * chat-service applies before it persists a component, so what renders
 * live is what history brings back.
 */
import type { MessageComponent } from "../transport";

/** The `command` value that asks for a component. */
export const DISPLAY_COMPONENT_COMMAND = "displayComponent";

/**
 * A name a host could register: a letter first, then letters, digits and
 * `_ . : -`. Narrow on purpose — a name is a lookup key, never markup.
 */
const COMPONENT_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The component a `command` payload asks for, or `null` when it is any
 * other command or a malformed one. `props` defaults to `{}`; present but
 * not an object makes the whole command invalid.
 */
export function parseDisplayComponent(command: unknown): MessageComponent | null {
  if (!isPlainObject(command)) return null;
  if (command.command !== DISPLAY_COMPONENT_COMMAND) return null;
  const { component, props } = command;
  if (typeof component !== "string" || !COMPONENT_NAME.test(component)) return null;
  if (props !== undefined && !isPlainObject(props)) return null;
  return { component, props: props ?? {} };
}
