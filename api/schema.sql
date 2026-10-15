-- Warframe Damage Calc API schema (Cloudflare D1 / SQLite). Safe to run repeatedly.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,            -- Discord user ID
  username TEXT NOT NULL,
  display_name TEXT,
  avatar TEXT,
  created_at INTEGER NOT NULL,
  last_login INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,    -- SHA-256 of the cookie token (the token itself is never stored)
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS builds (
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, name)
);

CREATE TABLE IF NOT EXISTS owned (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS shares_user ON shares(user_id);

-- Share extras (kept in their own table so existing databases need no ALTER TABLE)
CREATE TABLE IF NOT EXISTS share_meta (
  id TEXT PRIMARY KEY REFERENCES shares(id),
  public INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,      -- set by reports or an admin
  title TEXT,
  weapon TEXT,
  image TEXT,
  dps INTEGER,
  summary TEXT
);
CREATE INDEX IF NOT EXISTS share_meta_public ON share_meta(public, hidden);

CREATE TABLE IF NOT EXISTS likes (
  share_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (share_id, user_id)
);

CREATE TABLE IF NOT EXISTS reports (
  share_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (share_id, user_id)
);
