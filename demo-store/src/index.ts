import { StoreMCP } from "./mcp.js";
import { MANIFEST, moduleData, backend } from "./manifest.js";
import type { Env } from "./types.js";

// McpAgent Durable Object must be exported from the Worker entry.
export { StoreMCP };

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(body === null ? "" : JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
  });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    // Remote MCP server (Streamable HTTP) - this is the URL you add to Claude.
    if (path === "/ai2w/mcp" || path.startsWith("/ai2w/mcp/")) {
      return StoreMCP.serve("/ai2w/mcp", { binding: "STORE_MCP" }).fetch(request, env, ctx);
    }

    // Discovery anchor + canonical manifest.
    if (path === "/.well-known/ai2w") return json(200, { ai2w: `${url.origin}/ai2w` });
    if (path === "/ai2w" || path === "/ai") return json(200, MANIFEST);

    // Read-only module routes (content, products, events).
    const moduleMatch = path.match(/^\/ai2w\/([a-z0-9_-]+)$/i);
    if (moduleMatch) {
      const data = moduleData(moduleMatch[1]);
      return data === undefined
        ? json(404, { error: { code: "unsupported_capability", message: `Module '${moduleMatch[1]}' not exposed.` } })
        : json(200, data);
    }

    // REST action routes (mirror the MCP tools; approval enforced the same way).
    const actionMatch = path.match(/^\/ai2w\/actions\/([a-z0-9_-]+)$/i);
    if (actionMatch && request.method === "POST") {
      const id = actionMatch[1].replace(/-/g, "_");
      const action = MANIFEST.actions.find((a) => a.id === id);
      if (!action) return json(404, { error: { code: "unsupported_capability" } });
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const gated = action.requires_user_approval || action.risk === "high";
      if (gated && body.confirm !== true) {
        return json(200, { preview: true, action: id, risk: action.risk, message: "Requires explicit user approval; resend with confirm:true.", proposed: body });
      }
      return json(200, await backend(id, body));
    }

    // Friendly landing.
    if (path === "/") {
      return json(200, { name: MANIFEST.site.name, manifest: `${url.origin}/ai2w`, mcp: `${url.origin}/ai2w/mcp`, add_to_claude: "Add the mcp URL as a custom connector in Claude." });
    }

    return json(404, { error: { code: "invalid_request", message: `No route for ${path}.` } });
  },
};
