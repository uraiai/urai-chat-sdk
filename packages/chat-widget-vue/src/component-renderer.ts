import {
  createApp,
  h,
  render,
  type App,
  type AppContext,
  type Component,
} from "vue";
import type {
  ComponentRenderer,
  ComponentRenderers,
} from "@uraiai/chat-widget-core";

export interface VueComponentRendererOptions {
  /**
   * Render inside an existing app's context, so the component sees that
   * app's plugins (router, pinia, i18n), global components and `provide`s.
   * Take it from `getCurrentInstance()!.appContext` in the host's `setup`,
   * or from `app._context`. When set, `setup` is ignored: the component is
   * not given an app of its own.
   */
  appContext?: AppContext;
  /**
   * Configure the app created for each component before it mounts — install
   * plugins, add `provide`s, set an `errorHandler`. Called once per rendered
   * component.
   */
  setup?(app: App): void;
}

/**
 * Turn a Vue component into a core `ComponentRenderer`, for the floating
 * `<UraiChatWidget>` (or `createUraiChatWidget`). The component receives the
 * same props a `displayComponents` entry on the inline `<UraiChat>` does:
 * `{ props, component, sendMessage }` — the tool's props as **one** object,
 * never spread, so a tool cannot set `key`, `ref`, `class` or a listener.
 *
 * Each rendered component is its own Vue app (or, with `appContext`, a
 * render into the host app's context), unmounted when the message leaves the
 * transcript.
 *
 * ```ts
 * const displayComponents = {
 *   OrderCard: vueComponentRenderer(OrderCard, { setup: (app) => app.use(i18n) }),
 * };
 * ```
 */
export function vueComponentRenderer(
  component: Component,
  options: VueComponentRendererOptions = {},
): ComponentRenderer {
  return (element, props, context) => {
    const componentProps = {
      props,
      component: context.component,
      sendMessage: (text: string) => context.sendMessage(text),
    };

    if (options.appContext) {
      const vnode = h(component, componentProps);
      vnode.appContext = options.appContext;
      render(vnode, element);
      return () => render(null, element);
    }

    const app = createApp({ render: () => h(component, componentProps) });
    options.setup?.(app);
    app.mount(element);
    return () => app.unmount();
  };
}

/**
 * `vueComponentRenderer` over a whole map, with the same options for each:
 * `{ OrderCard, MapCard }` → `ComponentRenderers`.
 */
export function vueComponentRenderers(
  components: Record<string, Component>,
  options: VueComponentRendererOptions = {},
): ComponentRenderers {
  const out: ComponentRenderers = {};
  for (const [name, component] of Object.entries(components)) {
    out[name] = vueComponentRenderer(component, options);
  }
  return out;
}
