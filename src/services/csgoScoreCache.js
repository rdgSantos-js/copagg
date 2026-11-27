// ------------------------------------------------------------------------------------------
// Gerencia a cópia em memória dos placares ativos. Ao iniciar ou após uma sincronização,
// lê do SQLite apenas as partidas marcadas como em andamento e o horário da última
// atualização bem-sucedida. Devolve uma cópia independente dos dados para impedir que uma
// rota altere acidentalmente o estado compartilhado.
// ------------------------------------------------------------------------------------------




import { getDatabase } from "../db/database.js";

// Armazena o snapshot compartilhado de placares para as rotas locais.
let cache = {
  matches: [],
  updatedAt: null,
};

// Reconstrói o cache em memória usando apenas os registros persistidos no SQLite.
export function hydrateCsgoScoreCache(db = getDatabase()) {
  const rows = db
    .prepare(
      `SELECT match_id, name, status, begin_at, teams_json
       FROM csgo_live_matches
       WHERE is_running = 1
       ORDER BY begin_at, match_id`,
    )
    .all();
  const metadata = db
    .prepare(
      "SELECT last_success_at FROM sync_metadata WHERE sync_key = ?",
    )
    .get("csgo_running");

  cache = {
    matches: rows.map((row) => ({
      matchId: row.match_id,
      name: row.name,
      status: row.status,
      beginAt: row.begin_at,
      teams: JSON.parse(row.teams_json),
    })),
    updatedAt: metadata?.last_success_at ?? null,
  };

  return getCsgoScoreCache();
}

// Retorna uma cópia do snapshot para evitar alterações no estado compartilhado.
export function getCsgoScoreCache() {
  return structuredClone(cache);
}
