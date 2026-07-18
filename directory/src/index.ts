// AI2Web Discovery Network on Cloudflare Workers + D1.
// Stores ONLY public metadata. Verification-first: /register never trusts submitted
// manifest data - it fetches the site's real /.well-known/ai2w server-side, validates it,
// and requires the manifest origin to match the submitted URL before storing.

interface Env {
  DIRECTORY: D1Database;
  REGISTER_TOKEN?: string; // optional secret; if set, /register also requires it
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

const MANIFEST_MAX = 262144; // 256 KB cap on a fetched manifest
const FETCH_TIMEOUT = 6000;
const RATE_LIMIT = 12; // registrations per IP per window
const RATE_WINDOW = 600_000; // 10 min

// SSRF guard: only public https hosts may be fetched/stored. Blocks loopback, private,
// link-local/metadata, CGNAT and alternative IP encodings.
export function isSafePublicHttps(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost")) return false;
  if (h.includes(":")) { // IPv6 literal - block loopback / ULA / link-local / mapped-v4
    const mapped = h.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/) || h.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || mapped) return false;
    return true;
  }
  if (/(^|\.)0x/.test(h)) return false; // hex-encoded
  const q = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (q) {
    const [a, b] = [Number(q[1]), Number(q[2])];
    if ([0, 10, 127].includes(a) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a > 255 || b > 255) return false;
    return true;
  }
  if (!/[a-z]/.test(h)) return false; // decimal/octal/short-form numeric host
  return true;
}

const enabled = (v: unknown) => v === true || (typeof v === "object" && v !== null && (v as { enabled?: boolean }).enabled === true);

// Lightweight validity check - mirrors @ai2web/core just enough to reject non-manifests.
export function validateManifest(m: any): { valid: boolean; errors: string[]; caps: string[] } {
  const errors: string[] = [];
  if (!m || typeof m !== "object") return { valid: false, errors: ["not an object"], caps: [] };
  if (m.protocol !== "ai2w") errors.push("protocol must be 'ai2w'");
  if (!/^\d+\.\d+(\.\d+)?$/.test(String(m.version ?? ""))) errors.push("version missing/invalid");
  for (const k of ["name", "url", "type"]) if (!m.site?.[k]) errors.push(`site.${k} missing`);
  const caps = Object.entries(m.capabilities ?? {}).filter(([, v]) => enabled(v)).map(([k]) => k);
  if (!caps.length) errors.push("no enabled capabilities");
  return { valid: errors.length === 0, errors, caps };
}

const originOf = (u: string) => { try { return new URL(u).origin; } catch { return null; } };

// Fetch the site's real manifest, server-side, with SSRF re-guard on every hop.
export async function fetchManifest(origin: string): Promise<any | null> {
  const anchor = `${origin}/.well-known/ai2w`;
  const get = async (u: string) => {
    if (!isSafePublicHttps(u)) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(u, { headers: { accept: "application/json", "user-agent": "AI2Web-Directory/1.0" }, redirect: "follow", signal: ctrl.signal });
      if (!res.ok) return null;
      if (res.url && !isSafePublicHttps(res.url)) return null; // re-check after redirects
      const text = (await res.text()).slice(0, MANIFEST_MAX);
      return JSON.parse(text);
    } catch { return null; } finally { clearTimeout(t); }
  };
  let m = await get(anchor);
  // Pointer form: { ai2w: "https://host/ai2w" }
  if (m && typeof m.ai2w === "string" && m.protocol === undefined) m = await get(m.ai2w);
  if (!m) m = await get(`${origin}/ai2w`); // fall back to the canonical endpoint
  return m;
}

async function rateOk(env: Env, ip: string): Promise<boolean> {
  const since = Date.now() - RATE_WINDOW;
  try {
    const row: any = await env.DIRECTORY.prepare("SELECT COUNT(*) AS n FROM register_log WHERE ip = ? AND at > ?").bind(ip, since).first();
    if ((row?.n ?? 0) >= RATE_LIMIT) return false;
    await env.DIRECTORY.prepare("INSERT INTO register_log (ip, at) VALUES (?, ?)").bind(ip, Date.now()).run();
    return true;
  } catch { return true; } // fail-open on a missing table; verification is the real gate
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (request.method === "GET" && path === "/sites") {
      const p = url.searchParams;
      const clauses: string[] = [];
      const binds: unknown[] = [];
      if (p.get("capability")) { clauses.push("capabilities LIKE ?"); binds.push(`%"${p.get("capability")}"%`); }
      if (p.get("type")) { clauses.push("type = ?"); binds.push(p.get("type")); }
      if (p.get("q")) { clauses.push("(lower(name) LIKE ? OR lower(type) LIKE ?)"); const q = `%${p.get("q")!.toLowerCase()}%`; binds.push(q, q); }
      if (p.get("verified") === "true") clauses.push("verification = 'verified'");
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const rows = await env.DIRECTORY.prepare(`SELECT id,name,url,type,capabilities,manifest_url,mcp_endpoint,verification,health,version FROM sites${where} ORDER BY (verification='verified') DESC, name LIMIT 50`).bind(...binds).all();
      return json(200, { sites: (rows.results ?? []).map((r: any) => ({ ...r, capabilities: safeParse(r.capabilities) })) });
    }

    const one = path.match(/^\/sites\/([\w.-]+)$/);
    if (request.method === "GET" && one) {
      const r: any = await env.DIRECTORY.prepare("SELECT id,name,url,type,capabilities,manifest_url,mcp_endpoint,verification,health,version FROM sites WHERE id = ?").bind(one[1]).first();
      return r ? json(200, { ...r, capabilities: safeParse(r.capabilities) }) : json(404, { error: { code: "not_found" } });
    }

    // POST /register  { url }  -- the manifest is fetched + verified server-side, never taken from the body.
    if (request.method === "POST" && path === "/register") {
      if (env.REGISTER_TOKEN && request.headers.get("authorization") !== `Bearer ${env.REGISTER_TOKEN}`) {
        return json(401, { error: { code: "auth_required" } });
      }
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      if (!(await rateOk(env, ip))) return json(429, { error: { code: "rate_limited", message: "too many registrations, try later" } });

      const raw = await request.text();
      if (raw.length > 4096) return json(413, { error: { code: "payload_too_large" } });
      let body: any;
      try { body = JSON.parse(raw || "{}"); } catch { return json(400, { error: { code: "invalid_request", message: "invalid JSON" } }); }

      // Accept only a URL. Any submitted manifest is ignored - we fetch the real one.
      const submitted: string | undefined = body.url ?? body.site ?? body?.manifest?.site?.url;
      if (!submitted) return json(400, { error: { code: "invalid_request", message: "url required" } });
      const origin = originOf(submitted);
      if (!origin || !isSafePublicHttps(origin)) return json(400, { error: { code: "invalid_request", message: "url must be a public https origin" } });

      const m = await fetchManifest(origin);
      if (!m) return json(422, { error: { code: "no_manifest", message: `no AI2Web manifest found at ${origin}/.well-known/ai2w` } });
      const v = validateManifest(m);
      if (!v.valid) return json(422, { error: { code: "invalid_manifest", message: "manifest is not valid", details: v.errors } });

      // The manifest MUST claim the same origin it is served from (anti-impersonation).
      const claimed = originOf(m.site.url);
      if (claimed !== origin) return json(422, { error: { code: "origin_mismatch", message: `manifest.site.url (${claimed}) does not match ${origin}` } });

      const id = origin;
      const base = origin;
      const mcp = m.transports?.mcp?.enabled && m.transports.mcp.endpoint ? `${base}${m.transports.mcp.endpoint}` : null;
      const existed: any = await env.DIRECTORY.prepare("SELECT created_at FROM sites WHERE id = ?").bind(id).first();
      const created = existed?.created_at ?? Date.now();
      await env.DIRECTORY.prepare(
        `INSERT INTO sites (id,name,url,type,capabilities,manifest_url,mcp_endpoint,verification,health,version,created_at,last_checked)
         VALUES (?,?,?,?,?,?,?, 'verified', 'healthy', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, capabilities=excluded.capabilities,
           manifest_url=excluded.manifest_url, mcp_endpoint=excluded.mcp_endpoint, verification='verified',
           health='healthy', version=excluded.version, last_checked=excluded.last_checked`
      ).bind(id, m.site.name, origin, m.site.type ?? "other", JSON.stringify(v.caps), `${base}/ai2w`, mcp, m.version, created, Date.now()).run();
      return json(201, { id, name: m.site.name, url: origin, type: m.site.type, capabilities: v.caps, verification: "verified" });
    }

    if (path === "/") return json(200, { service: "AI2Web Discovery Network", endpoints: ["/sites", "/sites/:id", "POST /register"], note: "register verifies the live manifest server-side; submitted data is ignored" });
    return json(404, { error: { code: "not_found" } });
  },

  // Health cron: re-fetch each site's manifest and update health; demote if it disappears.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      const rows = await env.DIRECTORY.prepare("SELECT id, url FROM sites LIMIT 200").all();
      for (const r of (rows.results ?? []) as any[]) {
        const m = await fetchManifest(String(r.url).replace(/\/+$/, ""));
        const healthy = m && validateManifest(m).valid && originOf(m.site?.url) === originOf(r.url);
        await env.DIRECTORY.prepare("UPDATE sites SET health = ?, verification = ?, last_checked = ? WHERE id = ?")
          .bind(healthy ? "healthy" : "unreachable", healthy ? "verified" : "unverified", Date.now(), r.id).run();
      }
    })());
  },
};

function safeParse(s: unknown): unknown { try { return JSON.parse(String(s)); } catch { return []; } }
