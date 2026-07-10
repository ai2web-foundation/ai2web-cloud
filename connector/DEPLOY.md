# Deploy the AI2Web connector + add it to Claude

The connector is one remote MCP server that fronts the Discovery Network and can act on any AI2Web site. Add it once to Claude and it reaches the whole network.

## Deploy
```bash
cd ai2web-cloud/connector
npm install
```
Set `DIRECTORY_URL` in `wrangler.jsonc` to your deployed Discovery Network URL (from `../directory`). Then:
```bash
npx wrangler deploy      # -> https://ai2web-connector.<subdomain>.workers.dev
```

## Add it to Claude
Add this as a custom connector in Claude:
`https://ai2web-connector.<subdomain>.workers.dev/mcp`

It exposes three tools:
- `find_sites` - search the Discovery Network by capability / type / text.
- `describe_site` - fetch a site's manifest and list its actions.
- `call_site_action` - call an action; approval-gated ones return a preview unless `confirm:true`.

## Try the full network flow
1. "Find AI-ready stores that sell shoes." -> `find_sites` returns the demo store.
2. "Where's my order A1023 at Example Store?" -> `describe_site` then `call_site_action` `track_order` -> tracking.
3. "It arrived damaged, refund it." -> `call_site_action` `request_refund` returns a **preview**; on approval Claude re-calls with `confirm:true` and it refunds with an audit reference.

## Authenticated per-site actions (OAuth) - for real stores
The demo store uses no auth, so the flow above works immediately. Real stores run actions as the logged-in customer, which needs OAuth:
1. Put OAuth in front of this connector with **`@cloudflare/workers-oauth-provider`** (see Cloudflare's "Securing MCP servers" docs). Claude runs the OAuth flow when adding the connector.
2. The connector obtains a per-site scoped token (the site is the OAuth provider, per RFC-0003) and forwards it on `call_site_action` **only to the same origin** as the site (the same-origin credential rule is already enforced by the SSRF guard + `resolveUrl`).
3. Scopes map to capabilities (`read_orders`, `manage_returns`, …).

This is the next hardening step; the connector is structured so adding the OAuth wrapper does not change the tool logic.
