"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  ChatActions,
  ChatState,
  ChatStore,
} from "@uraiai/chat-widget-core/headless";
import type { UraiChatComponents } from "./components/registry";
import type { UraiChatIcons } from "./icons";
import type { UraiChatLabels } from "./labels";
import type { UraiChatClassNames } from "./class-names";

/**
 * Two contexts, and neither carries mutating chat state.
 *
 * Everything that changes during a turn is read through
 * `useChatSelector`, so a token flush cannot propagate through context
 * and re-render the whole tree.
 */
interface ChatStoreContextValue {
  store: ChatStore;
  actions: ChatActions;
}

const ChatStoreContext = createContext<ChatStoreContextValue | null>(null);

export interface PresentationContextValue {
  components: UraiChatComponents;
  classNames: UraiChatClassNames;
  labels: UraiChatLabels;
  icons: UraiChatIcons;
  unstyled: boolean;
  /** Stable id prefix for ARIA relationships. */
  idPrefix: string;
}

const PresentationContext = createContext<PresentationContextValue | null>(null);

/** The message a `<Chat.Message>` subtree is rendering. */
const MessageContext = createContext<string | null>(null);

export function ChatStoreProvider(props: {
  store: ChatStore;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ store: props.store, actions: props.store.actions }),
    [props.store],
  );
  return (
    <ChatStoreContext.Provider value={value}>
      {props.children}
    </ChatStoreContext.Provider>
  );
}

export function PresentationProvider(props: {
  value: PresentationContextValue;
  children: ReactNode;
}) {
  return (
    <PresentationContext.Provider value={props.value}>
      {props.children}
    </PresentationContext.Provider>
  );
}

export function MessageProvider(props: { id: string; children: ReactNode }) {
  return (
    <MessageContext.Provider value={props.id}>
      {props.children}
    </MessageContext.Provider>
  );
}

function useStoreContext(): ChatStoreContextValue {
  const ctx = useContext(ChatStoreContext);
  if (!ctx) {
    throw new Error(
      "[UraiChat] hook used outside <Chat.Root>. Wrap your tree in <Chat.Root> or use <UraiChat>.",
    );
  }
  return ctx;
}

export function usePresentation(): PresentationContextValue {
  const ctx = useContext(PresentationContext);
  if (!ctx) {
    throw new Error("[UraiChat] hook used outside <Chat.Root>.");
  }
  return ctx;
}

export function useMessageId(explicit?: string): string {
  const fromContext = useContext(MessageContext);
  const id = explicit ?? fromContext;
  if (!id) {
    throw new Error(
      "[UraiChat] no message in scope — pass an `id` or render inside <Chat.Message>.",
    );
  }
  return id;
}

/**
 * Subscribe to a slice of store state.
 *
 * Selectors are compared with `Object.is` by default, so a selector that
 * builds a fresh object each call must supply `isEqual` (use
 * `shallowEqual`). Returning an uncached object with the default
 * comparator is the classic infinite-render trap.
 */
export function useChatSelector<T>(
  selector: (state: ChatState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const { store } = useStoreContext();

  // Held in refs so the subscription is never torn down just because the
  // caller passed a fresh arrow function.
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  const lastRef = useRef<{ state: ChatState; value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const state = store.getState();
    const last = lastRef.current;
    if (last && last.state === state) return last.value;
    const value = selectorRef.current(state);
    if (last && isEqualRef.current(last.value, value)) {
      // Keep the previous reference so React bails out of the re-render.
      lastRef.current = { state, value: last.value };
      return last.value;
    }
    lastRef.current = { state, value };
    return value;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** Actions never change identity, so this never triggers a re-render. */
export function useChatActions(): ChatActions {
  return useStoreContext().actions;
}

export function useChatStore(): ChatStore {
  return useStoreContext().store;
}

export function shallowEqual<T extends Record<string, unknown>>(
  a: T,
  b: T,
): boolean {
  if (Object.is(a, b)) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}
