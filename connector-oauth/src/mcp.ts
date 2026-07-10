import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import type { Env, Props } from "./types.js";
import { Store } from "./tokens.js";
import { randomString, pkceChallenge } from "./pkce.js";
import { assertSafePublicUrl, resolveUrl } from "./safety.js";

type State = Record<string, never>;

/**
 * OAuth-federated network connector. The user authenticates to the CONNECTOR (this.props),
 * then connects individual sites via `connect_site` (per-site OAuth 2.1 + PKCE). Tokens are
 * stored per (user, site) and used - same-origin only - when calling that site's authenticated
 * actions. So one connector acts as the user across many real, logged-in stores.
 */
export class ConnectorMCP extends McpAgent<Env, State, Props> {
  server = new McpServer({ name: "ai2web-connector", version: "0.1.0" });
  initialState: State = {};

  async init() {
    const dir = this.env.DIRECTORY_URL.replace(/\/+$/, "");
    const store = new Store(this.env.CONNECTOR_KV);
    const userId = this.props.userId;

    this.server.registerTool("whoami", { description: "Show the signed-in user and which sites they've connected.", inputSchema: {} }, async () => ({
      content: [{ type: "text", text: JSON.stringify({ userId, username: this.props.username }) }],
    }));

    this.server.registerTool(
      "find_sites",
      { description: "Find AI-ready (AI2Web) websites by capability, type or free text.", inputSchema: { capability: z.string().optional(), type: z.string().optional(), q: z.string().optional() } },
      async (args: Record<string, unknown>) => {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(args)) if (v) p.set(k, String(v));
        const res = await fetch(`${dir}/sites?${p.toString()}`);
        return { content: [{ type: "text", text: await res.text() }] };
      },
    );

    this.server.registerTool(
      "describe_site",
      { description: "Fetch a site's AI2Web manifest and list its capabilities, actions, and whether it needs a login (OAuth).", inputSchema: { url: z.string() } },
      async ({ url }: { url: string }) => {
        const m = await discover(url);
        const origin = new URL(m.site.url).origin;
        const connected = !!(await store.getToken(userId, origin));
        const actions = (m.actions ?? []).map((a: any) => ({ id: a.id ?? a.name, description: a.description, risk: a.risk, requires_auth: !!a.requires_auth, requires_approval: a.requires_user_approval || a.risk === "high" }));
        return { content: [{ type: "text", text: JSON.stringify({ site: m.site, needs_login: !!m.auth?.oauth2, connected, capabilities: Object.keys(m.capabilities ?? {}), actions }) }] };
      },
    );

    this.server.registerTool(
      "connect_site",
      { description: "Connect the user's account at a site so authenticated actions (orders, refunds) can run as them. Returns a link the user opens once.", inputSchema: { url: z.string() } },
      async ({ url }: { url: string }) => {
        const m = await discover(url);
        const oauth = m.auth?.oauth2;
        if (!oauth?.authorization_url || !oauth?.token_url) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "no_oauth", message: "This site does not require a login; its actions are public." }) }] };
        }
        const origin = new URL(m.site.url).origin;
        const callback = `${this.env.CONNECTOR_ORIGIN.replace(/\/+$/, "")}/connect/callback`;
        const clientId = await registerClient(origin, callback);
        if (!clientId) return { content: [{ type: "text", text: JSON.stringify({ error: "registration_failed", message: "Could not register with the site's OAuth server." }) }] };

        const verifier = randomString();
        const state = randomString();
        const challenge = await pkceChallenge(verifier);
        await store.putPending(state, { userId, origin, verifier, tokenUrl: oauth.token_url, clientId, redirectUri: callback });

        const authUrl = new URL(oauth.authorization_url);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", callback);
        authUrl.searchParams.set("code_challenge", challenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
        authUrl.searchParams.set("state", state);
        if (Array.isArray(oauth.scopes)) authUrl.searchParams.set("scope", oauth.scopes.join(" "));

        return { content: [{ type: "text", text: JSON.stringify({ connect_url: authUrl.toString(), message: `Open this link to connect your ${m.site.name} account, then ask me again.` }) }] };
      },
    );

    this.server.registerTool(
      "call_site_action",
      { description: "Call one of a site's declared actions. If it needs a login and the user has not connected, tells them to connect_site first. Approval-gated actions return a preview unless confirm:true.", inputSchema: { url: z.string(), action: z.string(), input: z.record(z.any()).optional(), confirm: z.boolean().optional() } },
      async ({ url, action, input, confirm }: { url: string; action: string; input?: Record<string, unknown>; confirm?: boolean }) => {
        const m = await discover(url);
        const a = (m.actions ?? []).find((x: any) => (x.id ?? x.name) === action);
        if (!a) return { content: [{ type: "text", text: JSON.stringify({ error: "unknown_action" }) }] };
        const origin = new URL(m.site.url).origin;

        let token: string | undefined;
        if (a.requires_auth) {
          const t = await store.getToken(userId, origin);
          if (!t) return { content: [{ type: "text", text: JSON.stringify({ error: "not_connected", message: `Connect your ${m.site.name} account first: call connect_site with url ${origin}.` }) }] };
          token = t.access_token;
        }

        const gated = a.requires_user_approval || a.risk === "high";
        if (gated && confirm !== true) {
          return { content: [{ type: "text", text: JSON.stringify({ preview: true, action: a.id ?? a.name, risk: a.risk, message: "Needs the user's explicit approval. If they approve, call again with confirm:true.", proposed: input }) }] };
        }

        const endpoint = resolveUrl(a.endpoint, m.site.url);
        assertSafePublicUrl(endpoint);
        // Same-origin credential rule: only send the token to the origin it was issued for.
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (token && new URL(endpoint).origin === origin) headers.authorization = `Bearer ${token}`;
        const res = await fetch(endpoint, { method: a.method ?? "POST", headers, body: JSON.stringify({ ...(input ?? {}), confirm }) });
        return { content: [{ type: "text", text: await res.text() }] };
      },
    );
  }
}

async function registerClient(origin: string, callback: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "AI2Web Connector", redirect_uris: [callback], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    return j.client_id ?? null;
  } catch {
    return null;
  }
}

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
