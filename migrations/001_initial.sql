CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  google_id TEXT UNIQUE,
  demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth (
  id TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  expires BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS bands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL REFERENCES users(id),
  invite TEXT UNIQUE NOT NULL,
  finalized INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS members (
  band_id TEXT NOT NULL REFERENCES bands(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  approved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (band_id, user_id)
);
CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  band_id TEXT NOT NULL REFERENCES bands(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  youtube TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created BIGINT NOT NULL,
  UNIQUE (band_id, youtube)
);
CREATE TABLE IF NOT EXISTS votes (
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('up', 'down', 'veto', 'neutral')),
  reason TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (song_id, user_id)
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires);
CREATE INDEX IF NOT EXISTS members_user_idx ON members(user_id);
CREATE INDEX IF NOT EXISTS songs_band_idx ON songs(band_id);
