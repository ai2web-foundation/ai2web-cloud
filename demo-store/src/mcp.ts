import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { MANIFEST, backend } from "./manifest.js";
import { inputShape } from "./schema.js";
import { WIDGETS, WIDGET_RESOURCES } from "./widgets.js";
import type { Env } from "./types.js";

type State = Record<string, never>;

/**
 * Remote MCP server for the demo store. Each declared AI2Web action becomes an MCP tool.
 * Approval-gated actions (high-risk or requires_user_approval) return a preview unless
 * called again with confirm:true, so a refund never executes without approval.
 *
 * ChatGPT Apps SDK: track_order and request_refund also declare a UI widget via
 * _meta["openai/outputTemplate"] and return structuredContent, so ChatGPT renders a
 * live tracking card / an interactive refund confirm instead of raw JSON.
 */
export class StoreMCP extends McpAgent<Env, State, {}> {
  server = new McpServer({ name: `ai2w:${MANIFEST.site.name}`, version: MANIFEST.version });
  initialState: State = {};

  async init() {
    // Register the UI widget resources (text/html+skybridge) that ChatGPT renders.
    for (const [uri, { name, html }] of Object.entries(WIDGET_RESOURCES)) {
      this.server.registerResource(name, uri, { mimeType: "text/html+skybridge" }, async () => ({
        contents: [{ uri, mimeType: "text/html+skybridge", text: html }],
      }));
    }

    for (const action of MANIFEST.actions ?? []) {
      const gated = action.requires_user_approval || action.risk === "high";
      const shape = inputShape(action.input_schema);
      const inputSchema: z.ZodRawShape = gated
        ? { ...shape, confirm: z.boolean().optional().describe("Set true ONLY after the user has explicitly approved this action.") }
        : shape;
      const description = action.description + (gated ? " Requires explicit user approval: first call returns a preview; after the user approves, call again with confirm:true." : "");

      const widget = WIDGETS[action.id];
      const config: Record<string, unknown> = { description, inputSchema };
      if (widget) config._meta = { "openai/outputTemplate": widget };

      this.server.registerTool(action.id, config, async (args: Record<string, unknown>) => {
        if (gated && args.confirm !== true) {
          const preview = { preview: true, action: action.id, risk: action.risk, message: "This action needs the user's explicit approval.", proposed: { ...args, confirm: undefined } };
          return { content: [{ type: "text", text: JSON.stringify(preview) }], structuredContent: preview };
        }
        const result = (await backend(action.id, args)) as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      });
    }

    if (MANIFEST.agent_service?.enabled) {
      this.server.registerTool(
        "ask_store_agent",
        { description: `Ask the store's support agent. Intents: ${MANIFEST.agent_service.supported_intents.join(", ")}.`, inputSchema: { message: z.string(), intent: z.string().optional() } },
        async ({ message, intent }: { message: string; intent?: string }) => ({ content: [{ type: "text", text: JSON.stringify({ reply: `(demo agent) You said: "${message}"${intent ? ` [intent: ${intent}]` : ""}. Try track_order or request_refund.` }) }] }),
      );
    }
  }
}
