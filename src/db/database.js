// ------------------------------------------------------------------------------------------
// Cria e inicializa a conexão SQLite usada pela aplicação para persistir placares ao vivo
// de Counter-Strike. Prepara automaticamente a pasta de dados, as tabelas de partidas e
// metadados e o índice usado nas leituras. Expõe uma conexão compartilhada para produção
// e uma fábrica que aceita banco em memória para testes isolados.
// ------------------------------------------------------------------------------------------




import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultDatabasePath = resolve(projectRoot, "data", "pandascore.sqlite");

// Cria a conexão SQLite, prepara a pasta de dados e garante o esquema necessário.
export function createDatabase(databasePath = defaultDatabasePath) {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS csgo_live_matches (
      match_id INTEGER PRIMARY KEY,
      name TEXT,
      status TEXT NOT NULL,
      begin_at TEXT,
      teams_json TEXT NOT NULL,
      is_running INTEGER NOT NULL DEFAULT 1,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_csgo_live_matches_running
      ON csgo_live_matches (is_running, begin_at);

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
  `);

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
