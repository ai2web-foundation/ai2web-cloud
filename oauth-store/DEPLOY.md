# Deploy the OAuth-protected store

Same as the demo store, but the MCP endpoint is behind **OAuth 2.1 + PKCE** (via `@cloudflare/workers-oauth-provider`). When Claude connects, it runs the OAuth flow; tools then execute as the **signed-in customer** (`this.props`), scoped to their granted scopes. This is the pattern a real store uses.

## Setup
```bash
cd ai2web-cloud/oauth-store
npm install
npx wrangler kv namespace create OAUTH_KV     # put the id in wrangler.jsonc
npx wrangler deploy                            # -> https://ai2web-oauth-store.<subdomain>.workers.dev
```
Set the manifest's `ORIGIN` (top of `src/manifest.ts`) to your deployed URL and redeploy.

## What the provider gives you (for free)
- `/authorize` - consent screen (this repo renders a demo login; swap for your real login).
- `/token`, `/register` - OAuth 2.1 token + dynamic client registration endpoints.
- `/ai2w/mcp` - the OAuth-protected MCP API. Tools receive `this.props = { userId, username, scopes }`.
- Public discovery (`/ai2w`, `/.well-known/ai2w`, product/content reads) stays open.

## Add to Claude
Add `https://ai2web-oauth-store.<subdomain>.workers.dev/ai2w/mcp` as a custom connector. Claude will:
1. Register itself (dynamic client registration), redirect you to `/authorize`.
2. You "sign in" (demo: any email) and approve the requested scopes (`read_orders`, `track_delivery`, `manage_returns`).
3. Claude gets a scoped token and lists the tools.

## Try it
- "Who am I?" -> `whoami` returns your signed-in identity + scopes.
- "List my orders" / "track order A1023" -> runs as you (needs `read_orders` / `track_delivery`).
- "Refund order A1023" -> `request_refund` returns a **preview** (needs `manage_returns`); on approval, call again with `confirm:true` to execute.

## Make it real
- Replace the demo `/authorize` login with your actual auth (or federate to GitHub/Google/an IdP).
- Map OAuth scopes to real permissions and enforce them in the backend (already stubbed via `need(scope)` in `src/manifest.ts`).
- Tokens are short-lived; refresh + revocation are handled by the provider.

> Note: the exact `@cloudflare/workers-oauth-provider` version/types evolve - if `wrangler deploy` complains about the constructor options or `completeAuthorization` shape, check the current library README. The flow (parseAuthRequest -> consent -> completeAuthorization -> redirect) is stable.
