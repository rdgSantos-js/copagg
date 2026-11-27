// ------------------------------------------------------------------------------------------
// Cria e inicializa o banco SQLite com entidades normalizadas da PandaScore e logs.
// Prepara a pasta de dados e índices e oferece conexões compartilhadas ou em memória.
// ------------------------------------------------------------------------------------------




import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultDatabasePath = resolve(projectRoot, "data", "pandascore.sqlite");

function addMissingColumns(db, tableName, columns) {
  const existingColumns = new Set(
    db.pragma(`table_info(${tableName})`).map((column) => column.name),
  );

  for (const [column, type] of Object.entries(columns)) {
    if (!existingColumns.has(column)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${column} ${type}`);
      existingColumns.add(column);
    }
  }
}

// Cria a conexão SQLite, prepara a pasta de dados e garante o esquema necessário.
export function createDatabase(databasePath = defaultDatabasePath) {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const legacyTable = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get("csgo_live_matches");

  if (legacyTable) {
    const { count } = db
      .prepare("SELECT COUNT(*) AS count FROM csgo_live_matches")
      .get();

    if (count > 0) {
      db.close();
      throw new Error(
        "Legacy csgo_live_matches table contains data; refusing to discard it.",
      );
    }

    db.exec("DROP TABLE csgo_live_matches");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS videogames (
      id INTEGER PRIMARY KEY,
      pandascore_id INTEGER,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY,
      name TEXT,
      slug TEXT,
      url TEXT,
      image_url TEXT,
      videogame_id INTEGER REFERENCES videogames(id)
    );

    CREATE TABLE IF NOT EXISTS series (
      id INTEGER PRIMARY KEY,
      league_id INTEGER REFERENCES leagues(id),
      name TEXT,
      slug TEXT,
      begin_at TEXT,
      end_at TEXT,
      full_name TEXT,
      modified_at TEXT,
      season TEXT,
      winner_id INTEGER,
      winner_type TEXT,
      year INTEGER
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY,
      series_id INTEGER REFERENCES series(id),
      league_id INTEGER REFERENCES leagues(id),
      name TEXT,
      slug TEXT,
      tier TEXT,
      begin_at TEXT,
      end_at TEXT,
      type TEXT,
      country TEXT,
      detailed_stats INTEGER,
      winner_id INTEGER,
      winner_type TEXT,
      region TEXT,
      modified_at TEXT,
      prizepool TEXT,
      has_bracket INTEGER,
      live_supported INTEGER
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      acronym TEXT,
      image_url TEXT,
      dark_mode_image_url TEXT,
      location TEXT,
      modified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY,
      tournament_id INTEGER REFERENCES tournaments(id),
      league_id INTEGER REFERENCES leagues(id),
      series_id INTEGER REFERENCES series(id),
      videogame_id INTEGER REFERENCES videogames(id),
      slug TEXT,
      name TEXT,
      status TEXT NOT NULL,
      begin_at TEXT,
      expected_begin_at TEXT,
      end_at TEXT,
      scheduled_at TEXT,
      original_scheduled_at TEXT,
      detailed_stats INTEGER,
      draw INTEGER,
      forfeit INTEGER,
      game_advantage INTEGER,
      match_type TEXT,
      modified_at TEXT,
      number_of_games INTEGER,
      rescheduled INTEGER,
      videogame_title_id INTEGER,
      videogame_title_name TEXT,
      videogame_title_slug TEXT,
      videogame_title_videogame_id INTEGER,
      videogame_version_current INTEGER,
      videogame_version_name TEXT,
      winner_id INTEGER,
      winner_type TEXT,
      is_running INTEGER NOT NULL DEFAULT 1,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS match_teams (
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      opponent_type TEXT,
      score INTEGER,
      PRIMARY KEY (match_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS match_streams (
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      embed_url TEXT,
      language TEXT,
      main INTEGER,
      official INTEGER,
      raw_url TEXT,
      PRIMARY KEY (match_id, position)
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      position INTEGER,
      status TEXT,
      begin_at TEXT,
      end_at TEXT,
      length INTEGER,
      winner_id INTEGER,
      winner_type TEXT
    );

    CREATE TABLE IF NOT EXISTS game_teams (
      game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      score INTEGER,
      PRIMARY KEY (game_id, team_id)
    );

    CREATE INDEX IF NOT EXISTS idx_matches_running
      ON matches (is_running, begin_at);

    CREATE INDEX IF NOT EXISTS idx_matches_tournament
      ON matches (tournament_id);

    CREATE INDEX IF NOT EXISTS idx_series_league
      ON series (league_id);

    CREATE INDEX IF NOT EXISTS idx_tournaments_series
      ON tournaments (series_id);

    CREATE INDEX IF NOT EXISTS idx_games_match
      ON games (match_id, position);

    CREATE TABLE IF NOT EXISTS sync_metadata (
      sync_key TEXT PRIMARY KEY,
      last_success_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL,
      provider TEXT NOT NULL,
      method TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      page INTEGER,
      category TEXT NOT NULL,
      http_status INTEGER,
      error_code TEXT,
      message TEXT NOT NULL,
      retryable INTEGER NOT NULL CHECK (retryable IN (0, 1))
    );

    CREATE INDEX IF NOT EXISTS idx_api_error_logs_occurred_at
      ON api_error_logs (occurred_at);

    CREATE TABLE IF NOT EXISTS api_request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requested_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      provider TEXT NOT NULL,
      method TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      page INTEGER,
      http_status INTEGER,
      duration_ms INTEGER NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('success', 'error')),
      error_code TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_api_request_logs_requested_at
      ON api_request_logs (requested_at);
  `);

  addMissingColumns(db, "videogames", {
    pandascore_id: "INTEGER",
  });
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_videogames_pandascore_id
      ON videogames (pandascore_id)
  `);

  addMissingColumns(db, "leagues", {
    videogame_id: "INTEGER REFERENCES videogames(id)",
    url: "TEXT",
    image_url: "TEXT",
  });
  addMissingColumns(db, "series", {
    full_name: "TEXT",
    modified_at: "TEXT",
    season: "TEXT",
    winner_id: "INTEGER",
    winner_type: "TEXT",
    year: "INTEGER",
  });
  addMissingColumns(db, "tournaments", {
    league_id: "INTEGER REFERENCES leagues(id)",
    type: "TEXT",
    country: "TEXT",
    detailed_stats: "INTEGER",
    winner_id: "INTEGER",
    winner_type: "TEXT",
    region: "TEXT",
    modified_at: "TEXT",
    prizepool: "TEXT",
    has_bracket: "INTEGER",
    live_supported: "INTEGER",
  });
  addMissingColumns(db, "teams", {
    dark_mode_image_url: "TEXT",
    location: "TEXT",
    modified_at: "TEXT",
  });
  addMissingColumns(db, "matches", {
    league_id: "INTEGER REFERENCES leagues(id)",
    series_id: "INTEGER REFERENCES series(id)",
    videogame_id: "INTEGER REFERENCES videogames(id)",
    slug: "TEXT",
    scheduled_at: "TEXT",
    original_scheduled_at: "TEXT",
    detailed_stats: "INTEGER",
    draw: "INTEGER",
    forfeit: "INTEGER",
    game_advantage: "INTEGER",
    match_type: "TEXT",
    modified_at: "TEXT",
    number_of_games: "INTEGER",
    rescheduled: "INTEGER",
    videogame_title_id: "INTEGER",
    videogame_title_name: "TEXT",
    videogame_title_slug: "TEXT",
    videogame_title_videogame_id: "INTEGER",
    videogame_version_current: "INTEGER",
    videogame_version_name: "TEXT",
    winner_id: "INTEGER",
    winner_type: "TEXT",
  });
  db.exec("CREATE INDEX IF NOT EXISTS idx_matches_slug ON matches (slug)");

  addMissingColumns(db, "match_teams", {
    opponent_type: "TEXT",
  });

  db.transaction(() => {
    db.prepare(`
      INSERT INTO videogames (name, slug)
      VALUES ('Counter-Strike', 'cs-go')
      ON CONFLICT(slug) DO NOTHING
    `).run();
    db.prepare(`
      UPDATE leagues
      SET videogame_id = (
        SELECT id FROM videogames WHERE slug = 'cs-go'
      )
      WHERE videogame_id IS NULL
        OR videogame_id = (
          SELECT id FROM videogames WHERE slug = 'csgo'
        )
    `).run();
    db.prepare("DELETE FROM videogames WHERE slug = 'csgo'").run();
  })();

  return db;
}

let defaultDatabase;

// Retorna a conexão padrão, inicializando-a apenas na primeira chamada.
export function getDatabase() {
  if (!defaultDatabase) {
    defaultDatabase = createDatabase();
  }

  return defaultDatabase;
}
