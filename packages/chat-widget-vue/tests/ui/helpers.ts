import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick, type Slots } from "vue";
import { makeFakeTransport, type FakeTransport } from "@uraiai/chat-test-support";
import { UraiChat } from "../../src/ui";

export const TOKEN = "11111111-2222-3333-4444-555555555555";

/** Poll until `fn` stops throwing — the Vue analogue of testing-library's `waitFor`. */
export async function waitFor<T>(fn: () => T, timeout = 1500): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      return fn();
    } catch (e) {
      if (Date.now() - start > timeout) throw e;
      await flushPromises();
      await new Promise((r) => setTimeout(r, 5));
    }
  }
}

/**
 * Stream updates are coalesced to one notification per animation frame, so
 * a burst of tokens costs one render rather than N. Tests have to await that
 * frame — this is real behaviour, not a test artifact.
 */
export async function frame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  await nextTick();
  await flushPromises();
}

export interface MountOptions {
  transport?: FakeTransport;
  props?: Record<string, unknown>;
  slots?: Record<string, unknown>;
}

export function mountChat(over: MountOptions = {}) {
  const transport = over.transport ?? makeFakeTransport();
  const wrapper = mount(UraiChat, {
    props: {
      widgetToken: TOKEN,
      userId: "visitor-1",
      fetchServerConfig: false,
      transport,
      disableStyleInjection: true,
      ...over.props,
    } as never,
    slots: over.slots as Slots | undefined as never,
    attachTo: document.body,
  });
  return { transport, wrapper };
}

/** The client is created in `onMounted`, so wait for the composer to exist. */
export async function ready(wrapper: VueWrapper): Promise<HTMLTextAreaElement> {
  return waitFor(() => {
    const el = wrapper.find("textarea");
    if (!el.exists()) throw new Error("no composer yet");
    return el.element as HTMLTextAreaElement;
  });
}

/** Type into the composer and press Enter. */
export async function send(wrapper: VueWrapper, text: string): Promise<void> {
  const box = wrapper.find("textarea");
  await box.setValue(text);
  await box.trigger("keydown", { key: "Enter" });
  await flushPromises();
}

export function stream(t: FakeTransport) {
  const h = t.lastStreamHandlers();
  if (!h) throw new Error("no stream open");
  return h;
}

/** Send a message and wait until its stream is open. */
export async function startTurn(wrapper: VueWrapper, transport: FakeTransport, text = "hello") {
  await ready(wrapper);
  await send(wrapper, text);
  await waitFor(() => {
    if (!transport.lastStreamHandlers()) throw new Error("no stream");
  });
  return stream(transport);
}

export function callArgs(t: FakeTransport, method: string) {
  return t.calls.filter((c) => c.method === method).map((c) => c.args);
}

export function part(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-urai-part="${name}"]`);
}
