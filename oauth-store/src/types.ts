import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  STORE_MCP: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
}

// Authentication context carried on the OAuth grant and exposed to MCP tools via this.props.
export type Props = {
  userId: string;
  username: string;
  scopes: string[];
};
