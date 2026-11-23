CREATE TABLE seasons (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  registration_open BOOLEAN NOT NULL DEFAULT FALSE,
  winner_team_id TEXT,
  audit_seed TEXT,
  audit_commit TEXT,
  audit_locked_at TEXT,
  draw_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX participants_season_email ON participants(season_id, email);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX teams_season_name ON teams(season_id, name);

CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  entry_number INTEGER NOT NULL,
  card_type TEXT NOT NULL,
  team_id TEXT REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'active',
  collected_at TEXT,
  merchant TEXT,
  card_value_cents INTEGER NOT NULL DEFAULT 2500,
  distributed_to TEXT,
  distributed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX entries_participant_slot ON entries(participant_id, entry_number);
CREATE INDEX entries_season_status ON entries(season_id, status);
CREATE INDEX entries_team ON entries(team_id);

CREATE TABLE elimination_schedule (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  draw_date TEXT NOT NULL,
  draws_planned INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX schedule_season_date ON elimination_schedule(season_id, draw_date);

CREATE TABLE eliminations (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  entry_id TEXT NOT NULL REFERENCES entries(id),
  schedule_id TEXT REFERENCES elimination_schedule(id),
  draw_number INTEGER NOT NULL,
  pool_count INTEGER NOT NULL,
  pool_hash TEXT NOT NULL,
  random_proof TEXT NOT NULL,
  random_attempt INTEGER NOT NULL DEFAULT 0,
  selected_index INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX eliminations_season_draw ON eliminations(season_id, draw_number);
CREATE INDEX eliminations_season_created ON eliminations(season_id, created_at);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_log_season_created ON audit_log(season_id, created_at);

CREATE TABLE registration_rate_limits (
  id TEXT PRIMARY KEY,
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX rate_limit_bucket_window ON registration_rate_limits(bucket, window_start);
