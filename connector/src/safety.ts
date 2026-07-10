// SSRF guard (parity with @ai2web/core safety). Blocks loopback/private/link-local/metadata.
export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "::1" || (host.includes(":") && (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")))) return false;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  return true;
}

export function assertSafePublicUrl(raw: string): string {
  if (!isSafePublicUrl(raw)) throw new Error(`ai2w: refusing to fetch non-public or unsafe URL: ${raw}`);
  return raw;
}

export function resolveUrl(endpoint: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const path = endpoint.replace(/^\/+/, "/");
  return baseUrl.replace(/\/+$/, "") + (path.startsWith("/") ? "" : "/") + path;
}
