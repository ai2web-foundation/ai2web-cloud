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

-- Seed with the demo store so the connector has something to find.
INSERT OR IGNORE INTO sites (id, name, url, type, capabilities, manifest_url, mcp_endpoint, version, created_at)
VALUES ('example-store', 'Example Store', 'https://ai2web-demo-store.workers.dev', 'ecommerce',
        '["content","commerce","support","search","actions","events"]',
        'https://ai2web-demo-store.workers.dev/ai2w',
        'https://ai2web-demo-store.workers.dev/ai2w/mcp', '0.1', 0);
