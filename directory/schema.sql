-- AI2Web Discovery Network - public metadata only. Never customer data.
CREATE TABLE IF NOT EXISTS sites (
  id            TEXT PRIMARY KEY,     -- the site origin, e.g. https://example.com
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  type          TEXT,               -- free-form site.type from the manifest
  category      TEXT,               -- normalised, browsable category (see categorize() in index.ts)
  capabilities  TEXT,               -- JSON array of enabled capability names
  manifest_url  TEXT,
  mcp_endpoint  TEXT,
  verification  TEXT DEFAULT 'unverified',  -- 'verified' once the live manifest was fetched + origin-matched
  health        TEXT DEFAULT 'unknown',     -- 'healthy' | 'unreachable', updated by the health cron
  version       TEXT DEFAULT '0.1',
  created_at    INTEGER,
  last_checked  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sites_type ON sites(type);
CREATE INDEX IF NOT EXISTS idx_sites_category ON sites(category);

-- Per-IP register rate-limit log (rows older than the window are ignored; prune periodically).
CREATE TABLE IF NOT EXISTS register_log (
  ip  TEXT,
  at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_register_log ON register_log(ip, at);

-- Migration for existing deployments (safe to run once; ignore "duplicate column" errors):
--   ALTER TABLE sites ADD COLUMN last_checked INTEGER;
--   ALTER TABLE sites ADD COLUMN category TEXT;

-- RFC-0017 trust attestations (DESIGN STAGE, disabled unless TRUST_ENABLED=true).
-- Two-sided: a signal is trustworthy only when a matching 'site' and 'agent' row exist for the
-- same audit_ref. Positive-only (no negative signals) pending legal review (RFC-0017 §8).
CREATE TABLE IF NOT EXISTS attestations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_ref    TEXT NOT NULL,
  site_origin  TEXT NOT NULL,
  agent        TEXT NOT NULL,
  outcome      TEXT NOT NULL,
  rating       INTEGER,
  party        TEXT NOT NULL,     -- 'site' | 'agent'
  ts           INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attest_unique ON attestations(audit_ref, party);
CREATE INDEX IF NOT EXISTS idx_attest_site ON attestations(site_origin);

-- Seed with ai2web.dev, which serves a live manifest at /.well-known/ai2w.
INSERT OR IGNORE INTO sites (id, name, url, type, category, capabilities, manifest_url, verification, version, created_at)
VALUES ('https://ai2web.dev', 'AI2Web', 'https://ai2web.dev', 'content', 'content',
        '["content","search"]',
        'https://ai2web.dev/.well-known/ai2w', 'verified', '0.2', 0);
