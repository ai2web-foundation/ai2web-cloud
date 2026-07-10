import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { StoreMCP } from "./mcp.js";
import { defaultHandler } from "./auth-handler.js";

// McpAgent Durable Object must be exported from the Worker entry.
export { StoreMCP };

// OAuth 2.1 provider in front of the MCP endpoint. The provider serves /authorize,
// /token and /register; /ai2w/mcp is the OAuth-protected MCP API; everything else
// (the public AI2Web discovery surface + consent UI) goes to defaultHandler.
export default new OAuthProvider({
  apiRoute: "/ai2w/mcp",
  // @ts-expect-error - StoreMCP.serve returns a compatible handler for the API route.
  apiHandler: StoreMCP.serve("/ai2w/mcp"),
  // @ts-expect-error - defaultHandler is a fetch handler for all non-API routes.
  defaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["read_orders", "track_delivery", "manage_returns"],
});
