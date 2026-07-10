# Deploy the OAuth-federated connector

The network connector that **acts as the user across many real, logged-in stores**. Two OAuth relationships:
1. **Assistant -> Connector:** the assistant (Claude/ChatGPT) signs the user in to the connector (OAuth via `@cloudflare/workers-oauth-provider`), establishing `this.props.userId`.
2. **Connector -> each Site:** for a site that requires login, the user runs `connect_site` once; the connector performs OAuth 2.1 + PKCE with that site (each site is its own OAuth provider, per RFC-0003) and stores a token scoped to **(user, site)**. Tokens are isolated per user and per site, and only ever sent to the origin they were issued for.

## Setup
```bash
cd ai2web-cloud/connector-oauth
npm install
npx wrangler kv namespace create OAUTH_KV        # -> put id in wrangler.jsonc
npx wrangler kv namespace create CONNECTOR_KV     # -> put id in wrangler.jsonc
# set DIRECTORY_URL and CONNECTOR_ORIGIN (this worker's URL) in wrangler.jsonc vars
npx wrangler deploy
```

## Add to Claude / ChatGPT
Add `https://ai2web-connector-oauth.<sub>.workers.dev/mcp`. The assistant runs the connector's OAuth (you "sign in"), then lists tools: `find_sites`, `describe_site`, `connect_site`, `call_site_action`, `whoami`.

## The flow
1. "Find AI-ready shoe stores" -> `find_sites`.
2. "Track my order at Example Store" -> `describe_site` shows `needs_login: true`. The connector says: connect first.
3. "Connect Example Store" -> `connect_site` returns a link. You open it, log in at the store, approve. The store redirects to the connector's `/connect/callback`, which exchanges the code (PKCE) for a token scoped to (you, that store).
4. "Track my order A1023" -> `call_site_action` attaches your stored token (same-origin only) and returns your tracking.
5. "Refund it" -> preview -> approve -> `confirm:true` executes as you.

Pair it with `../oauth-store` as the site (it advertises the OAuth endpoints and supports dynamic client registration at `/register`).

## Verified logic (deploy-verified for the full flow)
- PKCE S256 matches the RFC 7636 test vector.
- Tokens isolated per (user, site); a token is never returned to another user or sent to a different origin.
- Pending OAuth state is one-time-use (deleted on callback) - no replay.

> The end-to-end OAuth handshakes (assistant<->connector, connector<->site, dynamic client registration, token exchange) can only be verified on deploy. Sites that do not support dynamic client registration need a pre-registered client id (extend `connect_site`). `@cloudflare/workers-oauth-provider` types evolve - check its README if `wrangler deploy` flags the constructor.
