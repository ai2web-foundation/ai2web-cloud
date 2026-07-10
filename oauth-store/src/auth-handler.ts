import { MANIFEST, moduleData } from "./manifest.js";
import type { Env } from "./types.js";

// The OAuthProvider "defaultHandler": handles the /authorize consent UI, and serves the
// PUBLIC AI2Web discovery surface (manifest, well-known, public module reads). Authenticated
// actions go through the OAuth-protected MCP endpoint, not here.
export const defaultHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // ---- OAuth consent flow ----
    if (path === "/authorize") {
      const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      const scopes = normaliseScopes(oauthReqInfo.scope);

      if (request.method === "GET") {
        const client = await env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId).catch(() => null);
        return html(consentPage(client?.clientName ?? oauthReqInfo.clientId, scopes, b64(oauthReqInfo)));
      }

      if (request.method === "POST") {
        const form = await request.formData();
        const req = JSON.parse(atob(String(form.get("req"))));
        if (form.get("action") !== "approve") {
          const redirect = new URL(req.redirectUri);
          redirect.searchParams.set("error", "access_denied");
          if (req.state) redirect.searchParams.set("state", req.state);
          return Response.redirect(redirect.toString(), 302);
        }
        const userId = String(form.get("userId") || "demo-customer").trim() || "demo-customer";
        const granted = normaliseScopes(req.scope);
        const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
          request: req,
          userId,
          metadata: { label: userId },
          scope: granted,
          props: { userId, username: userId, scopes: granted },
        });
        return Response.redirect(redirectTo, 302);
      }
    }

    // ---- Public AI2Web discovery (no auth) ----
    if (path === "/.well-known/ai2w") return json({ ai2w: `${url.origin}/ai2w` });
    if (path === "/ai2w" || path === "/ai") return json(MANIFEST);
    const m = path.match(/^\/ai2w\/([a-z0-9_-]+)$/i);
    if (m && request.method === "GET") {
      const data = moduleData(m[1]);
      return data === undefined ? json({ error: { code: "unsupported_capability" } }, 404) : json(data);
    }
    if (path === "/") return json({ name: MANIFEST.site.name, manifest: `${url.origin}/ai2w`, mcp: `${url.origin}/ai2w/mcp`, note: "Add the mcp URL to Claude; it will prompt you to sign in (OAuth)." });

    return json({ error: { code: "invalid_request" } }, 404);
  },
};

function normaliseScopes(scope: unknown): string[] {
  if (Array.isArray(scope)) return scope as string[];
  return String(scope ?? "").split(/[ ,]+/).filter(Boolean);
}
const b64 = (o: unknown) => btoa(JSON.stringify(o));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

function consentPage(clientName: string, scopes: string[], reqToken: string): string {
  const items = scopes.length ? scopes.map((s) => `<li><code>${escapeHtml(s)}</code></li>`).join("") : "<li>basic access</li>";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in - Example Store</title>
<style>body{margin:0;background:#000;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:grid;place-items:center;min-height:100vh}
.card{max-width:420px;width:92%;border:1px solid #242424;border-radius:14px;padding:26px;background:#0c0c0c}
h1{font-size:20px;margin:0 0 6px}p{color:#9a9a9a;font-size:14px}ul{color:#9a9a9a;font-size:14px}code{font-family:ui-monospace,Menlo,Consolas,monospace}
input{width:100%;padding:11px;border:1px solid #242424;border-radius:9px;background:#000;color:#fff;margin:8px 0 16px;box-sizing:border-box}
.row{display:flex;gap:10px}button{flex:1;padding:11px;border-radius:9px;font-weight:600;cursor:pointer;border:1px solid #fff}
.approve{background:#fff;color:#000}.deny{background:transparent;color:#fff;border-color:#242424}
.demo{font-size:12px;color:#6a6a6a;margin-top:14px}</style></head>
<body><form class="card" method="POST" action="/authorize">
<input type="hidden" name="req" value="${reqToken}">
<h1>Sign in to Example Store</h1>
<p><strong style="color:#fff">${escapeHtml(clientName)}</strong> wants to access your account and act on your behalf.</p>
<p>It is requesting:</p><ul>${items}</ul>
<label style="font-size:13px;color:#9a9a9a">Your email (demo - any value signs you in)</label>
<input name="userId" type="email" value="customer@example.com" autocomplete="email">
<div class="row"><button class="approve" name="action" value="approve">Approve</button><button class="deny" name="action" value="deny">Deny</button></div>
<p class="demo">Demo identity provider - no password. A real store would use its actual login.</p>
</form></body></html>`;
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
