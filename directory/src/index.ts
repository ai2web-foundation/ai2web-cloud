// AI2Web Discovery Network on Cloudflare Workers + D1.
// Stores ONLY public metadata. Search + register API the connector queries.

interface Env {
  DIRECTORY: D1Database;
  REGISTER_TOKEN?: string; // optional secret; if set, /register requires it
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

// SSRF/URL guard: only public https URLs may be stored (they become fetch targets for consumers).
function isSafePublicHttps(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return false;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\./);
  if (m) { const a = Number(m[1]); if ([0, 10, 127, 169, 172, 192].includes(a)) return false; }
  return true;
}

const enabled = (v: unknown) => v === true || (typeof v === "object" && v !== null && (v as { enabled?: boolean }).enabled === true);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    // GET /sites?capability=&type=&q=
    if (request.method === "GET" && path === "/sites") {
      const p = url.searchParams;
      const clauses: string[] = [];
      const binds: unknown[] = [];
      if (p.get("capability")) { clauses.push("capabilities LIKE ?"); binds.push(`%"${p.get("capability")}"%`); }
      if (p.get("type")) { clauses.push("type = ?"); binds.push(p.get("type")); }
      if (p.get("q")) { clauses.push("(lower(name) LIKE ? OR lower(type) LIKE ?)"); const q = `%${p.get("q")!.toLowerCase()}%`; binds.push(q, q); }
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const rows = await env.DIRECTORY.prepare(`SELECT id,name,url,type,capabilities,manifest_url,mcp_endpoint,verification,health,version FROM sites${where} LIMIT 50`).bind(...binds).all();
      const sites = (rows.results ?? []).map((r: any) => ({ ...r, capabilities: safeParse(r.capabilities) }));
      return json(200, { sites });
    }

    // GET /sites/:id
    const one = path.match(/^\/sites\/([\w-]+)$/);
    if (request.method === "GET" && one) {
      const r: any = await env.DIRECTORY.prepare("SELECT id,name,url,type,capabilities,manifest_url,mcp_endpoint,verification,health,version FROM sites WHERE id = ?").bind(one[1]).first();
      return r ? json(200, { ...r, capabilities: safeParse(r.capabilities) }) : json(404, { error: { code: "not_found" } });
    }

    // POST /register  { manifest, id? }
    if (request.method === "POST" && path === "/register") {
      if (env.REGISTER_TOKEN && request.headers.get("authorization") !== `Bearer ${env.REGISTER_TOKEN}`) {
        return json(401, { error: { code: "auth_required" } });
      }
      const raw = await request.text();
      if (raw.length > 262144) return json(413, { error: { code: "payload_too_large" } });
      let body: any;
      try { body = JSON.parse(raw || "{}"); } catch { return json(400, { error: { code: "invalid_request", message: "invalid JSON" } }); }
      const m = body.manifest;
      const siteUrl: string | undefined = m?.site?.url;
      if (!siteUrl) return json(400, { error: { code: "invalid_request", message: "manifest.site.url required" } });
      if (!isSafePublicHttps(siteUrl)) return json(400, { error: { code: "invalid_request", message: "site.url must be a public https URL" } });

      const id = String(body.id ?? siteUrl);
      const exists = await env.DIRECTORY.prepare("SELECT 1 FROM sites WHERE id = ?").bind(id).first();
      if (exists) return json(409, { error: { code: "forbidden", message: "record exists; overwrite not permitted" } });

      const caps = Object.entries(m.capabilities ?? {}).filter(([, v]) => enabled(v)).map(([k]) => k);
      const base = siteUrl.replace(/\/+$/, "");
      await env.DIRECTORY.prepare(
        "INSERT INTO sites (id,name,url,type,capabilities,manifest_url,mcp_endpoint,version,created_at) VALUES (?,?,?,?,?,?,?,?,?)"
      ).bind(id, m.site?.name ?? id, siteUrl, m.site?.type ?? "other", JSON.stringify(caps), `${base}/ai2w`, m.transports?.mcp?.endpoint ? `${base}${m.transports.mcp.endpoint}` : null, m.version ?? "0.1", Date.now()).run();
      return json(201, { id, name: m.site?.name ?? id, url: siteUrl, capabilities: caps });
    }

    if (path === "/") return json(200, { service: "AI2Web Discovery Network", endpoints: ["/sites", "/sites/:id", "/register"] });
    return json(404, { error: { code: "not_found" } });
  },
};

function safeParse(s: unknown): unknown { try { return JSON.parse(String(s)); } catch { return []; } }
