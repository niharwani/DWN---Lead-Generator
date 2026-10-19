CREATE TABLE waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT,
  requested_plan TEXT, -- 'freelancer' | 'teams' | 'studio' | NULL
  note TEXT,
  source TEXT, -- 'pricing_page' | 'billing_page' | 'settings_banner' | 'checkout_cta'
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX waitlist_email_idx ON waitlist(email);
CREATE INDEX waitlist_created_idx ON waitlist(created_at);
