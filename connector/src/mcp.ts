import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import type { Env } from "./types.js";
import { assertSafePublicUrl, resolveUrl } from "./safety.js";

type State = Record<string, never>;

/**
 * The agent-side connector: one remote MCP server that fronts the Discovery Network
 * and can act on any AI2Web site. This is what a user adds to Claude to get the whole
 * network, rather than one store at a time.
 *
 * Security: all outbound fetches are SSRF-guarded; approval-gated actions return a
 * preview unless confirm:true (so a refund never runs without the user's approval).
 * Authenticated per-site actions (running as the logged-in customer) require OAuth -
 * see DEPLOY.md; the demo store needs no auth so the full flow works without it.
 */
export class ConnectorMCP extends McpAgent<Env, State, {}> {
  server = new McpServer({ name: "ai2web-connector", version: "0.2.0" });
  initialState: State = {};

  async init() {
    const dir = this.env.DIRECTORY_URL.replace(/\/+$/, "");

    // --- ChatGPT-compatible retrieval pair. ChatGPT's connectors / Deep Research only invoke tools
    // named exactly `search` and `fetch` with these I/O shapes, so without them ChatGPT sees no
    // usable tools and pulls nothing. They wrap the same Discovery Network as find_sites/describe_site. ---
    this.server.registerTool(
      "search",
      { description: "Search the AI2Web Discovery Network for AI-ready websites (by keyword, capability or category). Returns matching sites; pass a result id to `fetch` for full details.", inputSchema: { query: z.string() } },
      async ({ query }: { query: string }) => {
        const res = await fetch(`${dir}/sites?q=${encodeURIComponent(query)}`);
        const data: any = await res.json().catch(() => ({ sites: [] }));
        const results = (data.sites ?? []).map((s: any) => ({
          id: s.url,
          title: s.name,
          url: s.url,
          text: `${s.category ?? s.type ?? "site"} · capabilities: ${(s.capabilities ?? []).join(", ") || "none"}${s.mcp_endpoint ? " · MCP" : ""}`,
        }));
        return { content: [{ type: "text", text: JSON.stringify({ results }) }] };
      },
    );

    this.server.registerTool(
      "fetch",
      { description: "Fetch full AI2Web details for a site id (its URL) returned by `search`: what it is, its capabilities, and the actions it exposes.", inputSchema: { id: z.string() } },
      async ({ id }: { id: string }) => {
        const manifest = await discover(id);
        const caps = Object.keys(manifest.capabilities ?? {});
        const actions = (manifest.actions ?? []).map((a: any) => ({ id: a.id ?? a.name, description: a.description, requires_approval: a.requires_user_approval || a.risk === "high" }));
        const lines = [
          `${manifest.site?.name ?? id} (${manifest.site?.type ?? "site"})`,
          manifest.site?.description ? `\n${manifest.site.description}` : "",
          `\nCapabilities: ${caps.join(", ") || "none"}`,
          actions.length ? `\nActions:\n${actions.map((a: any) => `  - ${a.id}${a.requires_approval ? " [needs approval]" : ""}: ${a.description ?? ""}`).join("\n")}` : "",
        ].filter(Boolean).join("");
        return { content: [{ type: "text", text: JSON.stringify({ id, title: manifest.site?.name ?? id, text: lines, url: manifest.site?.url ?? id, metadata: { type: manifest.site?.type, capabilities: caps } }) }] };
      },
    );

    this.server.registerTool(
      "find_sites",
      { description: "Find AI-ready (AI2Web) websites by capability, category, type or free text.", inputSchema: { capability: z.string().optional(), category: z.string().optional(), type: z.string().optional(), q: z.string().optional() } },
      async (args: Record<string, unknown>) => {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(args)) if (v) p.set(k, String(v));
        const res = await fetch(`${dir}/sites?${p.toString()}`);
        return { content: [{ type: "text", text: await res.text() }] };
      },
    );

    this.server.registerTool(
      "list_categories",
      { description: "List the categories of sites available in the AI2Web Discovery Network, with a count for each.", inputSchema: {} },
      async () => {
        const res = await fetch(`${dir}/categories`);
        return { content: [{ type: "text", text: await res.text() }] };
      },
    );

    this.server.registerTool(
      "describe_site",
      { description: "Fetch a site's AI2Web manifest and list the capabilities and actions it exposes to you.", inputSchema: { url: z.string() } },
      async ({ url }: { url: string }) => {
        const manifest = await discover(url);
        const actions = (manifest.actions ?? []).map((a: any) => ({ id: a.id ?? a.name, description: a.description, risk: a.risk, requires_approval: a.requires_user_approval || a.risk === "high" }));
        return { content: [{ type: "text", text: JSON.stringify({ site: manifest.site, capabilities: Object.keys(manifest.capabilities ?? {}), actions }) }] };
      },
    );

    this.server.registerTool(
      "call_site_action",
      { description: "Call one of a site's declared actions. Approval-gated actions (refunds, etc.) return a preview unless confirm:true.", inputSchema: { url: z.string(), action: z.string(), input: z.record(z.any()).optional(), confirm: z.boolean().optional() } },
      async ({ url, action, input, confirm }: { url: string; action: string; input?: Record<string, unknown>; confirm?: boolean }) => {
        const manifest = await discover(url);
        const a = (manifest.actions ?? []).find((x: any) => (x.id ?? x.name) === action);
        if (!a) return { content: [{ type: "text", text: JSON.stringify({ error: "unknown_action", available: (manifest.actions ?? []).map((x: any) => x.id ?? x.name) }) }] };
        const gated = a.requires_user_approval || a.risk === "high";
        if (gated && confirm !== true) {
          return { content: [{ type: "text", text: JSON.stringify({ preview: true, action: a.id ?? a.name, risk: a.risk, message: "This action needs the user's explicit approval. If they approve, call again with confirm:true.", proposed: input }) }] };
        }
        const endpoint = resolveUrl(a.endpoint, manifest.site.url);
        assertSafePublicUrl(endpoint);
        const res = await fetch(endpoint, { method: a.method ?? "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(input ?? {}), confirm }) });
        return { content: [{ type: "text", text: await res.text() }] };
      },
    );
  }
}

// Discover a site's manifest via /ai2w with /.well-known/ai2w fallback (SSRF-guarded).
async function discover(siteOrUrl: string): Promise<any> {
  const base = siteOrUrl.replace(/\/+$/, "");
  const candidates = /\/ai2w(\/|$)|\/\.well-known\/ai2w$/.test(base) ? [base] : [`${base}/ai2w`, `${base}/.well-known/ai2w`];
  for (const u of candidates) {
    assertSafePublicUrl(u);
    const res = await fetch(u, { headers: { accept: "application/json" }, redirect: "follow" });
    if (!res.ok) continue;
    if (res.url) assertSafePublicUrl(res.url);
    const j: any = await res.json();
    if (typeof j.ai2w === "string" && j.protocol === undefined) {
      assertSafePublicUrl(j.ai2w);
      const r2 = await fetch(j.ai2w, { headers: { accept: "application/json" } });
      if (r2.ok) return r2.json();
    }
    return j;
  }
  throw new Error(`No AI2Web manifest at ${base}`);
}
