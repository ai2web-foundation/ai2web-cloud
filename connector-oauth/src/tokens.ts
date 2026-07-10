// Per-user, per-site token store. Tokens are ISOLATED by (userId, siteOrigin) so one
// user's token for site A is never usable for site B or by another user.

export interface SiteToken {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  obtained_at: number;
}

export interface PendingConnect {
  userId: string;
  origin: string; // the site origin the token will be scoped to
  verifier: string; // PKCE code_verifier
  tokenUrl: string;
  clientId: string;
  redirectUri: string;
}

export class Store {
  private kv: KVNamespace;
  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  // Site tokens ------------------------------------------------------------
  private tokenKey(userId: string, origin: string): string {
    return `token:${encodeURIComponent(userId)}:${origin}`;
  }
  async getToken(userId: string, origin: string): Promise<SiteToken | null> {
    return (await this.kv.get(this.tokenKey(userId, origin), "json")) as SiteToken | null;
  }
  async putToken(userId: string, origin: string, token: SiteToken, ttlSeconds = 3600): Promise<void> {
    await this.kv.put(this.tokenKey(userId, origin), JSON.stringify(token), { expirationTtl: Math.max(60, ttlSeconds) });
  }

  // Pending OAuth (PKCE) state, keyed by the OAuth `state` param -----------
  private pendingKey(state: string): string {
    return `pkce:${state}`;
  }
  async putPending(state: string, p: PendingConnect, ttlSeconds = 600): Promise<void> {
    await this.kv.put(this.pendingKey(state), JSON.stringify(p), { expirationTtl: ttlSeconds });
  }
  async takePending(state: string): Promise<PendingConnect | null> {
    const raw = (await this.kv.get(this.pendingKey(state), "json")) as PendingConnect | null;
    if (raw) await this.kv.delete(this.pendingKey(state)); // one-time use
    return raw;
  }
}
