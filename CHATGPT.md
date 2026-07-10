# Add AI2Web to ChatGPT (Apps SDK / developer mode)

**The same Worker works in both assistants.** ChatGPT Apps are MCP servers over Streamable HTTP with optional OAuth - exactly what our `demo-store`, `oauth-store`, and `connector` Workers already expose. So there is no new server code for the ChatGPT path; it is a connection + (for public) a submission.

## 1. Enable developer mode
In ChatGPT: **Settings -> Connectors (or Apps) -> Advanced -> Developer mode**. Available on Pro, Plus, Business, Enterprise and Education. On Business/Enterprise/Education a workspace admin enables it under Workspace Settings -> Permissions & Roles -> Developer mode / custom MCP connectors.

## 2. Add the app
Go to `chatgpt.com` -> **Settings -> Apps/Plugins -> create a developer-mode app** (the `+`). Provide:
- **Name:** e.g. "Example Store" (or "AI2Web").
- **Description:** what it does and when to use it (this drives when ChatGPT invokes it) - e.g. *"Track orders, start returns and request refunds for Example Store; find AI-ready shops."*
- **MCP server URL:** the `/mcp` endpoint of your deployed Worker:
  - single store (no login): `https://ai2web-demo-store.<sub>.workers.dev/ai2w/mcp`
  - single store (OAuth): `https://ai2web-oauth-store.<sub>.workers.dev/ai2w/mcp`
  - the whole network: `https://ai2web-connector.<sub>.workers.dev/mcp`
- **Authentication:** `No authentication` for the demo store; `OAuth` for the oauth-store (ChatGPT runs the OAuth flow and signs the user in); Mixed is also supported.

ChatGPT supports **Streamable HTTP** (what our `McpAgent.serve()` uses) and SSE. The server must be reachable over HTTPS (Workers already are; for a local `wrangler dev` server use a Cloudflare Tunnel or ngrok).

## 3. Try it
Same prompts as Claude: *"track my order A1023"*, *"it arrived damaged, refund it"* (returns a preview -> approve -> executes). The server-side approval gate (`confirm:true`) protects refunds regardless of client.

## Rich in-ChatGPT UI (Apps SDK components) - BUILT for the demo store
The demo store's `track_order` and `request_refund` tools ship **UI widgets**: they declare `_meta["openai/outputTemplate"]` pointing at an HTML resource (served with MIME `text/html+skybridge`) and return `structuredContent`. In ChatGPT this renders:
- **`track_order`** -> a live delivery card (order id, carrier, a progress bar, ETA).
- **`request_refund`** -> an interactive **"Approve refund?"** card with a button; clicking it calls the tool again with `confirm:true` (the in-ChatGPT approval), then shows the receipt with the audit reference.

The widgets are in `demo-store/src/widgets.ts` and read `window.openai.toolOutput.structuredContent` (via the `openai:set_globals` event). They degrade to plain JSON in clients that don't render widgets (e.g. Claude), so the same server works everywhere.

## Public distribution (review-gated)
Developer mode is for testing and personal use immediately. To list the app publicly in the ChatGPT app directory you **submit it to OpenAI for review** (Apps SDK -> Submission), meeting their content, safety and metadata guidelines. This is the main difference from Claude, where custom connectors are added by URL without a review step.

## Claude vs ChatGPT at a glance
| | Claude | ChatGPT |
|---|---|---|
| Add by URL | Yes (custom connector) | Yes (developer mode) |
| Public listing | Directory (evolving) | Submission + review |
| Transport | Streamable HTTP / SSE | Streamable HTTP / SSE |
| Auth | OAuth | OAuth / none / mixed |

Sources: OpenAI Apps SDK "Connect from ChatGPT", "Build your MCP server", "Developer mode and MCP apps".
