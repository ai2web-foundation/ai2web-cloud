import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { ConnectorMCP } from "./mcp.js";
import { defaultHandler } from "./auth-handler.js";

export { ConnectorMCP };

// The connector's OWN OAuth (the assistant signs the user in here). /mcp is the protected
// MCP API; /authorize, /token, /register are for the assistant as an OAuth client of the
// connector; everything else (consent UI + the per-site /connect/callback) is defaultHandler.
export default new OAuthProvider({
  apiRoute: "/mcp",
  // @ts-expect-error - McpAgent.serve returns a compatible handler.
  apiHandler: ConnectorMCP.serve("/mcp"),
  // @ts-expect-error - fetch handler for all non-API routes.
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
