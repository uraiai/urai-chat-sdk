import { h, type Component, type FunctionalComponent, type VNode } from "vue";

/**
 * Icons are components, not SVG strings: no `v-html`, and `lucide-vue-next`
 * drops straight in.
 *
 * Every default is `aria-hidden`; the accessible name always comes from the
 * enclosing button's `aria-label`, never from the icon.
 */
export type UraiChatIcon = Component;

export interface UraiChatIcons {
  chevron: UraiChatIcon;
  plus: UraiChatIcon;
  search: UraiChatIcon;
  paperclip: UraiChatIcon;
  file: UraiChatIcon;
  download: UraiChatIcon;
  remove: UraiChatIcon;
  send: UraiChatIcon;
  stop: UraiChatIcon;
  scrollDown: UraiChatIcon;
}

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": "true",
  focusable: "false",
};

function icon(
  paths: () => VNode[],
  override: Record<string, unknown> = {},
): FunctionalComponent {
  // Attributes (a `class`, say) fall through onto the <svg>.
  const Icon: FunctionalComponent = () => h("svg", { ...base, ...override }, paths());
  return Icon;
}

export const defaultIcons: UraiChatIcons = {
  chevron: icon(() => [h("polyline", { points: "6 9 12 15 18 9" })]),
  plus: icon(() => [
    h("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
    h("line", { x1: "5", y1: "12", x2: "19", y2: "12" }),
  ]),
  search: icon(() => [
    h("circle", { cx: "11", cy: "11", r: "8" }),
    h("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" }),
  ]),
  paperclip: icon(() => [
    h("path", {
      d: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
    }),
  ]),
  file: icon(() => [
    h("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
    h("polyline", { points: "14 2 14 8 20 8" }),
  ]),
  download: icon(() => [
    h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
    h("polyline", { points: "7 10 12 15 17 10" }),
    h("line", { x1: "12", y1: "15", x2: "12", y2: "3" }),
  ]),
  remove: icon(
    () => [
      h("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
      h("line", { x1: "6", y1: "6", x2: "18", y2: "18" }),
    ],
    { "stroke-width": 2.5 },
  ),
  send: icon(() => [
    h("line", { x1: "12", y1: "19", x2: "12", y2: "5" }),
    h("polyline", { points: "5 12 12 5 19 12" }),
  ]),
  stop: icon(() => [h("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2" })], {
    fill: "currentColor",
  }),
  scrollDown: icon(() => [
    h("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
    h("polyline", { points: "19 12 12 19 5 12" }),
  ]),
};
