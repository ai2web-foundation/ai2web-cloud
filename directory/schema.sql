-- AI2Web Discovery Network - public metadata only. Never customer data.
CREATE TABLE IF NOT EXISTS sites (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  type          TEXT,
  capabilities  TEXT,               -- JSON array of enabled capability names
  manifest_url  TEXT,
  mcp_endpoint  TEXT,
  verification  TEXT DEFAULT 'unverified',
  health        TEXT DEFAULT 'unknown',
  version       TEXT DEFAULT '0.1',
  created_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sites_type ON sites(type);

-- Seed with ai2web.dev, which serves a live manifest at /.well-known/ai2w.
INSERT OR IGNORE INTO sites (id, name, url, type, capabilities, manifest_url, version, created_at)
VALUES ('ai2web', 'AI2Web', 'https://ai2web.dev', 'content',
        '["content","search"]',
        'https://ai2web.dev/.well-known/ai2w', '0.1', 0);
