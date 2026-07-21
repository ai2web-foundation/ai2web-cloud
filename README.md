<div align="center">
  <a href="https://ai2web.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ai2web-foundation/.github/main/profile/ai2web-logo-white.svg">
      <img alt="AI2Web" src="https://raw.githubusercontent.com/ai2web-foundation/.github/main/profile/ai2web-logo-black.svg" width="200">
    </picture>
  </a>
</div>

# AI2Web on Cloudflare

[![AI2Web on Launchpadly - Product of the Week (Gold)](https://launchpadly.co/embed/badges/startup/ai2web.svg?variant=product-week-gold)](https://launchpadly.co/startup/ai2web?ref=badge)

Deployable Cloudflare Workers that make AI2Web work end to end with AI assistants.

| Worker | What it is | Add to an assistant? |
|---|---|---|
| [`demo-store/`](demo-store/) | A reference store serving a live `/ai2w` manifest + a **remote MCP endpoint** (`/ai2w/mcp`), no login. | Yes - single-site, fastest demo. |
| [`oauth-store/`](oauth-store/) | The same store **behind OAuth 2.1 + PKCE** (`@cloudflare/workers-oauth-provider`). Tools run as the signed-in customer, scope-enforced. Scores 100/100 Enterprise. | Yes - the real-store pattern (Claude/ChatGPT run the login). |
| [`directory/`](directory/) | The Discovery Network as a Worker backed by D1 (search + register). | No - infrastructure the connector queries. |
| [`connector/`](connector/) | The agent-side connector: one remote MCP server that fronts the Discovery Network and can reach many sites (public actions, no per-site login). | Yes - the "one connector for the whole AI-ready web" pattern. |
| [`connector-oauth/`](connector-oauth/) | The connector **federated across logged-in sites**: it is an OAuth provider to the assistant *and* an OAuth client to each site, holding a token scoped to (user, site). Run `connect_site` once per store, then it acts as you. | Yes - the hardest and most powerful path: one connector that is signed in to many real stores. |

**Assistants:** these MCP servers work in **both Claude and ChatGPT** (same Streamable HTTP + OAuth). Claude: add the URL as a custom connector. ChatGPT: add it in developer mode - see [`CHATGPT.md`](CHATGPT.md).

## The two ways a user connects

1. **Single-site:** add a store's own `/ai2w/mcp` to Claude. Simplest; works with just `demo-store`.
2. **Network (public):** add the `connector` once; it discovers and runs public actions on any site in the Discovery Network.
3. **Network (federated login):** add `connector-oauth` once; sign in to it, then `connect_site` to each store you want it to act on your behalf. Per-site tokens, isolated per user, sent only to their own origin. Pair with `oauth-store` as the site.

## Stack
- **Workers** (+ Durable Objects via `McpAgent`) for the MCP servers - Streamable HTTP transport.
- **D1** (SQLite) for the Discovery Network store.
- **`@cloudflare/workers-oauth-provider`** for OAuth in front of authenticated actions.
- **Pages** for the marketing site (`../ai2web.dev`).

Each Worker deploys with `wrangler deploy`. See each folder's `DEPLOY.md`.

## Full deploy order (from zero to "works in Claude")

The fastest working demo needs only the **demo store** (single-site). The network demo adds the directory + connector.

```
1. wrangler login
2. Demo store:   cd demo-store && npm install && npx wrangler deploy
   -> note the URL; set site.url in src/manifest.ts to it, redeploy.
3. Directory:    cd ../directory && npm install
   npx wrangler d1 create ai2web-directory   # put the id in wrangler.jsonc
   npm run db:init                            # creates table + seeds the demo store
   npx wrangler deploy                        # note the URL
4. Connector:    cd ../connector && npm install
   # set DIRECTORY_URL in wrangler.jsonc to the directory URL from step 3
   npx wrangler deploy                        # note the URL
5. In Claude, add a custom connector:
   - single-site:  <demo-store-url>/ai2w/mcp
   - whole network: <connector-url>/mcp
6. Ask: "find AI-ready shoe stores", "track my order A1023", "refund it, it's damaged".
```

Refunds return a preview and only execute after you approve (enforced both client- and server-side). The demo uses no login; real stores add OAuth (see `connector/DEPLOY.md`).

## Local dev
Every Worker supports `npx wrangler dev`. Requires Node 18+ and `@modelcontextprotocol/sdk`, `agents`, `zod` installed (the demo store / connector `package.json` list them).
