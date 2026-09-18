"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import type { MessageComponent } from "@uraiai/chat-widget-core/headless";
import { useChatActions, usePresentation } from "../context";
import type { UraiChatDisplayComponents } from "./registry";

/** Names already warned about, so a missing component logs once. */
const warnedMissing = new Set<string>();

/**
 * The host's component for `name`, as an own property only — a tool
 * naming `constructor` or `toString` must not reach `Object.prototype`.
 */
export function lookupDisplayComponent(
  registry: UraiChatDisplayComponents,
  name: string,
) {
  return Object.prototype.hasOwnProperty.call(registry, name)
    ? registry[name]
    : undefined;
}

/**
 * One component a tool asked for, drawn with what the host registered
 * under its name. Nothing registered renders nothing. The tool's `props`
 * arrive as a single `props` object rather than spread, so a tool cannot
 * set `key`, `ref`, `children` or anything else React treats specially.
 */
export function DisplayComponent({ item }: { item: MessageComponent }) {
  const { displayComponents } = usePresentation();
  const actions = useChatActions();
  const Registered = lookupDisplayComponent(displayComponents, item.component);
  if (!Registered) {
    if (!warnedMissing.has(item.component)) {
      warnedMissing.add(item.component);
      console.warn(
        `[UraiChat] no component registered for "${item.component}"`,
      );
    }
    return null;
  }
  return (
    <DisplayComponentBoundary name={item.component}>
      <Registered
        component={item.component}
        props={item.props}
        sendMessage={(text) => void actions.send(text)}
      />
    </DisplayComponentBoundary>
  );
}

/**
 * Contains a host component that throws, so one bad card cannot unmount
 * the conversation around it.
 */
class DisplayComponentBoundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(
      `[UraiChat] component "${this.props.name}" failed to render:`,
      error,
      info.componentStack,
    );
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
