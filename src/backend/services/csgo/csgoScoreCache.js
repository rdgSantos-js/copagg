// Mantém em memória o snapshot de placares reconstruído a partir do SQLite.

import { getDatabase } from "../../db/database.js";
import { getCsgoRunningMatches } from "./csgoCatalogQueries.js";

let cache = {
  matches: [],
  updatedAt: null,
};

// Reconstrói o snapshot local sem consultar a PandaScore.
export function hydrateCsgoScoreCache(db = getDatabase()) {
  const matches = getCsgoRunningMatches(db);
  const metadata = db
    .prepare("SELECT last_success_at FROM sync_metadata WHERE sync_key = ?")
    .get("csgo_running");

  cache = {
    matches,
    updatedAt: metadata?.last_success_at ?? null,
  };

  return getCsgoScoreCache();
}

// Retorna uma cópia do snapshot para evitar alterações no estado compartilhado.
export function getCsgoScoreCache() {
  return structuredClone(cache);
}
