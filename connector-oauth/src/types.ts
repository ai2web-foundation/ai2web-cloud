import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  CONNECTOR_MCP: DurableObjectNamespace;
  OAUTH_KV: KVNamespace; // used by the connector's own OAuth provider
  CONNECTOR_KV: KVNamespace; // per-user site tokens + pending PKCE
  OAUTH_PROVIDER: OAuthHelpers;
  DIRECTORY_URL: string;
  CONNECTOR_ORIGIN: string; // this connector's public origin, for building redirect URIs
}

// The authenticated user of the CONNECTOR (set by the connector's own OAuth).
export type Props = {
  userId: string;
  username: string;
};
