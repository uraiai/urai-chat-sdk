import {
  inject,
  onScopeDispose,
  provide,
  shallowRef,
  type InjectionKey,
  type ShallowRef,
} from "vue";
import type {
  ChatActions,
  ChatState,
  ChatStore,
  UraiChatClassNames,
  UraiChatLabels,
} from "@uraiai/chat-widget-core/headless";
import type {
  UraiChatComponents,
  UraiChatDisplayComponents,
} from "./components/registry";
import type { UraiChatIcons } from "./icons";

/**
 * Two injections, and neither carries mutating chat state.
 *
 * Everything that changes during a turn is read through `useChatSelector`,
 * which keeps its own `shallowRef` per subscriber and only writes it when
 * the selected slice changes — so a token flush re-renders the streaming
 * row and nothing else.
 */
interface ChatStoreContextValue {
  store: ChatStore;
  actions: ChatActions;
}

const ChatStoreKey: InjectionKey<() => ChatStoreContextValue | null> =
  Symbol("urai-chat-store");

export interface PresentationContextValue {
  components: UraiChatComponents;
  /** What tools' `displayComponent` commands render with, by name. */
  displayComponents: UraiChatDisplayComponents;
  classNames: UraiChatClassNames;
  labels: UraiChatLabels;
  icons: UraiChatIcons;
  unstyled: boolean;
  /** Stable id prefix for ARIA relationships. */
  idPrefix: string;
}

const PresentationKey: InjectionKey<() => PresentationContextValue> =
  Symbol("urai-chat-presentation");

/** The message a `<Chat.Message>` subtree is rendering. */
const MessageKey: InjectionKey<() => string> = Symbol("urai-chat-message");

/**
 * Provided by `<ChatRoot>`. A getter, because the root recreates the client
 * when the connection changes — the subtree is keyed on that, so each
 * descendant reads the store once at setup and keeps it.
 */
export function provideChatStore(get: () => ChatStore | null): void {
  provide(ChatStoreKey, () => {
    const store = get();
    return store ? { store, actions: store.actions } : null;
  });
}

/**
 * Provided by `<ChatRoot>`. A getter over reactive state, so reads inside a
 * render function are tracked.
 */
export function providePresentation(get: () => PresentationContextValue): void {
  provide(PresentationKey, get);
}

export function provideMessageId(get: () => string): void {
  provide(MessageKey, get);
}

function useStoreContext(): ChatStoreContextValue {
  const get = inject(ChatStoreKey, null);
  const ctx = get?.();
  if (!ctx) {
    throw new Error(
      "[UraiChat] composable used outside <ChatRoot>. Wrap your tree in <ChatRoot> or use <UraiChat>.",
    );
  }
  return ctx;
}

/**
 * The resolved presentation: components, labels, icons, class names.
 *
 * Returns an object of getters over reactive state — read its properties
 * inside a render function or `computed` and they are tracked. Destructuring
 * it in `setup` takes a snapshot, which goes stale when labels or config
 * change.
 */
export function usePresentation(): PresentationContextValue {
  const get = inject(PresentationKey, null);
  if (!get) throw new Error("[UraiChat] composable used outside <ChatRoot>.");
  return {
    get components() {
      return get().components;
    },
    get displayComponents() {
      return get().displayComponents;
    },
    get classNames() {
      return get().classNames;
    },
    get labels() {
      return get().labels;
    },
    get icons() {
      return get().icons;
    },
    get unstyled() {
      return get().unstyled;
    },
    get idPrefix() {
      return get().idPrefix;
    },
  };
}

/** The id of the message in scope, from `<Chat.Message>` or an explicit id. */
export function useMessageId(explicit?: string): string {
  const fromContext = inject(MessageKey, null);
  const id = explicit ?? fromContext?.();
  if (!id) {
    throw new Error(
      "[UraiChat] no message in scope — pass an `id` or render inside <Chat.Message>.",
    );
  }
  return id;
}

/**
 * Subscribe to a slice of store state, as a read-only `shallowRef`.
 *
 * The ref is only written when the selected value changes under `isEqual`
 * (`Object.is` by default), so a selector that builds a fresh object each
 * call should pass `shallowEqual` — otherwise it re-renders on every store
 * notification. The subscription ends with the calling component (or effect
 * scope).
 */
export function useChatSelector<T>(
  selector: (state: ChatState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): Readonly<ShallowRef<T>> {
  const { store } = useStoreContext();
  const value = shallowRef(selector(store.getState())) as ShallowRef<T>;
  const off = store.subscribe(() => {
    const next = selector(store.getState());
    if (!isEqual(value.value, next)) value.value = next;
  });
  onScopeDispose(off);
  return value;
}

/** Actions never change identity. */
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
