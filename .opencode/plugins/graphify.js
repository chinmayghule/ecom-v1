// graphify — OpenCode V2 plugin.
// Registers a single tool.execute.before hook that prepends a one-off reminder
// to the next shell command once a knowledge graph exists.
//
// Ported from the V1 plugin emitted by `graphify opencode install`:
// V1 plugin objects (`export const X = async ({ directory }) => ({...})`) do not
// run under OpenCode V2, which expects a default export with `id` and `setup`.
// A plain object is used instead of importing `@opencode/plugin` so the plugin
// has no module-resolution dependency.

import { existsSync } from "node:fs";
import { join } from "node:path";

export default {
  id: "graphify",
  async setup(ctx) {
    const graph = join(ctx.location.directory, "graphify-out", "graph.json");
    const reminder =
      'echo "[graphify] Knowledge graph available. Read graphify-out/GRAPH_REPORT.md for god nodes and architecture context before searching files." && ';

    let reminded = false;

    await ctx.tool.hook("execute.before", (event) => {
      try {
        if (reminded) return;
        if (event.tool !== "shell" && event.tool !== "bash") return;
        if (!existsSync(graph)) return;

        const input = event.input;
        if (!input || typeof input.command !== "string") return;

        input.command = reminder + input.command;
        reminded = true;
      } catch {
        // Never let a reminder break tool execution.
      }
    });
  },
};
