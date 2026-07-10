import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { MANIFEST, backend } from "./manifest.js";
import { inputShape } from "./shared.js";
import type { Env, Props } from "./types.js";

type State = Record<string, never>;

/**
 * OAuth-protected MCP server. The third McpAgent generic is Props - the authenticated
 * customer, populated by the OAuth grant (see auth-handler.ts). Tools run as this.props,
 * so actions are scoped to the signed-in user and their granted scopes. High-risk actions
 * still require confirm:true (approval), enforced server-side.
 */
export class StoreMCP extends McpAgent<Env, State, Props> {
  server = new McpServer({ name: `ai2w:${MANIFEST.site.name}`, version: MANIFEST.version });
  initialState: State = {};

  async init() {
    const user = { userId: this.props.userId, scopes: this.props.scopes };

    for (const action of MANIFEST.actions) {
      const gated = action.requires_user_approval || action.risk === "high";
      const shape = inputShape(action.input_schema);
      const inputSchema: z.ZodRawShape = gated
        ? { ...shape, confirm: z.boolean().optional().describe("Set true ONLY after the user has explicitly approved this action.") }
        : shape;
      const description = action.description + (gated ? " Requires explicit user approval: first call returns a preview; after the user approves, call again with confirm:true." : "");

      this.server.registerTool(action.id, { description, inputSchema }, async (args: Record<string, unknown>) => {
        if (gated && args.confirm !== true) {
          return { content: [{ type: "text", text: JSON.stringify({ preview: true, action: action.id, risk: action.risk, message: "Needs the user's explicit approval. If they approve, call again with confirm:true.", proposed: { ...args, confirm: undefined } }) }] };
        }
        const result = await backend(user, action.id, args);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      });
    }

    this.server.registerTool("whoami", { description: "Show the signed-in customer and granted scopes.", inputSchema: {} }, async () => ({
      content: [{ type: "text", text: JSON.stringify({ userId: this.props.userId, username: this.props.username, scopes: this.props.scopes }) }],
    }));
  }
}
