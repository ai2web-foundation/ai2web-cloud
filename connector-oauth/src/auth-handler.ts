import type { Env } from "./types.js";
import { Store } from "./tokens.js";

// defaultHandler: (a) the connector's OWN OAuth consent (/authorize) so the assistant
// signs the user in to the connector; (b) /connect/callback, where a SITE redirects back
// after the user authorised it - we exchange the code for a token scoped to (user, site).
export const defaultHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const store = new Store(env.CONNECTOR_KV);

    // ---- (a) connector's own OAuth consent ----
    if (path === "/authorize") {
      const info = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      if (request.method === "GET") {
        const client = await env.OAUTH_PROVIDER.lookupClient(info.clientId).catch(() => null);
        return html(consentPage(client?.clientName ?? info.clientId, btoa(JSON.stringify(info))));
      }
      if (request.method === "POST") {
        const form = await request.formData();
        const req = JSON.parse(atob(String(form.get("req"))));
        if (form.get("action") !== "approve") return redirectWithError(req);
        const userId = String(form.get("userId") || "demo-user").trim() || "demo-user";
        const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
          request: req, userId, metadata: { label: userId }, scope: [], props: { userId, username: userId },
        });
        return Response.redirect(redirectTo, 302);
      }
    }

    // ---- (b) per-site OAuth callback: exchange code -> token, store per (user, site) ----
    if (path === "/connect/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const err = url.searchParams.get("error");
      if (err) return html(page("Connection failed", `The site returned: ${escapeHtml(err)}.`));
      if (!code || !state) return html(page("Connection failed", "Missing code or state."));
      const pending = await store.takePending(state);
      if (!pending) return html(page("Connection expired", "This connection link has expired. Ask your assistant to connect again."));

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: pending.redirectUri,
        client_id: pending.clientId,
        code_verifier: pending.verifier,
      });
      const tokenRes = await fetch(pending.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
      if (!tokenRes.ok) return html(page("Connection failed", `Token exchange failed (${tokenRes.status}).`));
      const tok: any = await tokenRes.json();
      await store.putToken(pending.userId, pending.origin, { access_token: tok.access_token, refresh_token: tok.refresh_token, scope: tok.scope, obtained_at: Date.now() }, tok.expires_in ?? 3600);

      return html(page("Connected", `Your account at <code>${escapeHtml(pending.origin)}</code> is connected. Return to your assistant and ask again.`));
    }

    if (path === "/") return json({ service: "AI2Web Connector (OAuth)", mcp: `${url.origin}/mcp` });
    return json({ error: { code: "not_found" } }, 404);
  },
};

function redirectWithError(req: any): Response {
  const r = new URL(req.redirectUri);
  r.searchParams.set("error", "access_denied");
  if (req.state) r.searchParams.set("state", req.state);
  return Response.redirect(r.toString(), 302);
}

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { "content-type": "application/json; charset=utf-8" } });
const html = (b: string) => new Response(b, { headers: { "content-type": "text/html; charset=utf-8" } });

function shell(title: string, inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{margin:0;background:#000;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:grid;place-items:center;min-height:100vh}
.card{max-width:420px;width:92%;border:1px solid #242424;border-radius:14px;padding:26px;background:#0c0c0c}
h1{font-size:20px;margin:0 0 8px}p{color:#9a9a9a;font-size:14px}code{font-family:ui-monospace,Menlo,Consolas,monospace}
input{width:100%;padding:11px;border:1px solid #242424;border-radius:9px;background:#000;color:#fff;margin:8px 0 16px;box-sizing:border-box}
.row{display:flex;gap:10px}button{flex:1;padding:11px;border-radius:9px;font-weight:600;cursor:pointer;border:1px solid #fff;background:#fff;color:#000}
button.deny{background:transparent;color:#fff;border-color:#242424}.demo{font-size:12px;color:#6a6a6a;margin-top:14px}</style></head><body>${inner}</body></html>`;
}
function page(title: string, msg: string): string {
  return shell(title, `<div class="card"><h1>${escapeHtml(title)}</h1><p>${msg}</p></div>`);
}
function consentPage(clientName: string, reqToken: string): string {
  return shell("Sign in - AI2Web Connector", `<form class="card" method="POST" action="/authorize">
<input type="hidden" name="req" value="${reqToken}">
<h1>Sign in to AI2Web</h1>
<p><strong style="color:#fff">${escapeHtml(clientName)}</strong> wants to connect on your behalf. You can then link individual stores.</p>
<label style="font-size:13px;color:#9a9a9a">Your email (demo - any value signs you in)</label>
<input name="userId" type="email" value="you@example.com" autocomplete="email">
<div class="row"><button name="action" value="approve">Approve</button><button class="deny" name="action" value="deny">Deny</button></div>
<p class="demo">Demo identity provider - no password.</p></form>`);
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
