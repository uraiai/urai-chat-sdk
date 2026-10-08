import { defineComponent } from "vue";

/**
 * A component that throws, to show the boundary doing its job: it takes
 * itself out of the transcript and leaves the conversation standing.
 */
export const BrokenCard = defineComponent({
  name: "BrokenCard",
  setup() {
    return () => {
      throw new Error("BrokenCard blew up on purpose");
    };
  },
});
