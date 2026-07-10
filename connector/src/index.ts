import { ConnectorMCP } from "./mcp.js";
import type { Env } from "./types.js";

// McpAgent Durable Object must be exported from the Worker entry.
export { ConnectorMCP };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // The remote MCP server (Streamable HTTP) - add this URL (+ /mcp) to Claude.
    if (path === "/mcp" || path.startsWith("/mcp/")) {
      return ConnectorMCP.serve("/mcp", { binding: "CONNECTOR_MCP" }).fetch(request, env, ctx);
    }

    if (path === "/") {
      return new Response(
        JSON.stringify({
          service: "AI2Web Connector",
          mcp: `${url.origin}/mcp`,
          tools: ["find_sites", "describe_site", "call_site_action"],
          add_to_claude: `Add ${url.origin}/mcp as a custom connector in Claude.`,
        }, null, 2),
        { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
      );
    }
    return new Response("Not found", { status: 404 });
  },
};
