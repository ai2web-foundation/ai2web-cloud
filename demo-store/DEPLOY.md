# Deploy the AI2Web demo store + add it to Claude

A Cloudflare Worker that serves a live `/ai2w` manifest and a **remote MCP endpoint** at `/ai2w/mcp`. Adding that URL to Claude lets you ask *"where's my order?"* / *"refund this, it's damaged"* and have it work, with refunds gated behind your approval.

## Prerequisites
- A Cloudflare account (free tier is fine).
- Node 18+ and a logged-in Wrangler: `npx wrangler login`.

## Run locally
```bash
cd ai2web-cloud/demo-store
npm install
npx wrangler dev
```
Then check:
- `http://localhost:8787/ai2w` - the manifest
- `http://localhost:8787/.well-known/ai2w` - the discovery pointer
- `http://localhost:8787/ai2w/mcp` - the MCP endpoint (use an MCP client / Claude, not a browser)

## Deploy
```bash
npx wrangler deploy
```
Wrangler prints your URL, e.g. `https://ai2web-demo-store.<your-subdomain>.workers.dev`. Your MCP endpoint is that `+ /ai2w/mcp`.

## Add it to Claude (single-site pattern)
1. In Claude (Settings -> Connectors -> Add custom connector), paste the MCP URL:
   `https://ai2web-demo-store.<your-subdomain>.workers.dev/ai2w/mcp`
2. Claude connects over Streamable HTTP and lists the store's tools (`check_stock`, `track_order`, `report_issue`, `start_return`, `request_refund`, `check_return_status`, `ask_store_agent`).

> Claude Desktop: if it only accepts local (stdio) servers in your version, bridge the remote server with `npx mcp-remote https://.../ai2w/mcp`, or use the connectors UI on claude.ai.

## Try it
- "Where's my order A1023?" -> `track_order` runs immediately (a read) and returns tracking.
- "My order A1023 arrived damaged, I want a refund." -> `report_issue` logs it, then `request_refund` returns a **preview** (it will not refund yet). Approve it, and Claude calls again with `confirm:true` to execute, returning an `audit_ref`.

## Notes
- This demo uses `auth.methods: ["none"]`, so tools are open (no login) to keep the demo simple. Refunds are still safe because approval is enforced **server-side** (the `confirm:true` gate), not just by the client.
- A real store adds OAuth so actions run as the logged-in customer. See `../connector/` for the OAuth pattern with `@cloudflare/workers-oauth-provider`.
- Set the manifest's `site.url` to your deployed URL before going live (edit `src/manifest.ts`).
