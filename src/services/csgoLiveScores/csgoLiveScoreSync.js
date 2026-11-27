// ------------------------------------------------------------------------------------------
// Consulta todas as páginas do endpoint de partidas em andamento de Counter-Strike na
// PandaScore, converte cada resultado para o formato interno e persiste o snapshot em uma
// única transação SQLite. Só atualiza o cache após o commit; se a chamada ou validação
// falhar, mantém os dados anteriores intactos.
// ------------------------------------------------------------------------------------------




import { getDatabase } from "../../db/database.js";
import { hydrateCsgoScoreCache } from "../csgoScoreCache.js";
import { mapCsgoMatch } from "../csgoScoreMapper.js";
import { recordPandaScoreError } from "../../integrations/pandascore/errorLog.js";
import { PANDASCORE_ENDPOINTS } from "../../integrations/pandascore/endpoints.js";

const PAGE_SIZE = 100;
const RUNNING_MATCHES_ENDPOINT = PANDASCORE_ENDPOINTS.csgo.runningMatches;

// Busca e normaliza todas as páginas de partidas que estão em andamento.
async function fetchRunningMatches(client, db, now) {
  const matches = [];
  let page = 1;

  while (true) {
    let response;
    try {
      response = await client.get(RUNNING_MATCHES_ENDPOINT, {
        params: {
          page,
          per_page: PAGE_SIZE,
        },
      });
    } catch (error) {
      recordPandaScoreError(db, error, {
        endpoint: RUNNING_MATCHES_ENDPOINT,
        page,
        now,
      });
      throw error;
    }

    if (!response || !Array.isArray(response.data)) {
      const error = new TypeError(
        "PandaScore returned an invalid running-matches response.",
      );
      recordPandaScoreError(db, error, {
        endpoint: RUNNING_MATCHES_ENDPOINT,
        page,
        category: "invalid_response",
        now,
      });
      throw error;
    }

    let mappedPage;
    try {
      mappedPage = response.data.map(mapCsgoMatch);
    } catch (error) {
      recordPandaScoreError(db, error, {
        endpoint: RUNNING_MATCHES_ENDPOINT,
        page,
        category: "invalid_response",
        now,
      });
      throw error;
    }

    matches.push(...mappedPage);

    if (response.data.length < PAGE_SIZE) {
      return matches;
    }

    page += 1;
  }
}

// Sincroniza as partidas, persiste o snapshot e atualiza o cache após o commit.
export async function syncCsgoLiveScores({
  client,
  db = getDatabase(),
  now = () => new Date(),
} = {}) {
  if (!client || typeof client.get !== "function") {
    throw new TypeError("A PandaScore-compatible HTTP client is required.");
  }

  const matches = await fetchRunningMatches(client, db, now);
  const fetchedAt = now().toISOString();

  const deactivateMatches = db.prepare(
    "UPDATE csgo_live_matches SET is_running = 0",
  );
  const upsertMatch = db.prepare(`
    INSERT INTO csgo_live_matches
      (match_id, name, status, begin_at, teams_json, is_running, fetched_at)
    VALUES
      (@matchId, @name, @status, @beginAt, @teamsJson, 1, @fetchedAt)
    ON CONFLICT(match_id) DO UPDATE SET
      name = excluded.name,
      status = excluded.status,
      begin_at = excluded.begin_at,
      teams_json = excluded.teams_json,
      is_running = 1,
      fetched_at = excluded.fetched_at
  `);
  const upsertMetadata = db.prepare(`
    INSERT INTO sync_metadata (sync_key, last_success_at)
    VALUES ('csgo_running', @fetchedAt)
    ON CONFLICT(sync_key) DO UPDATE SET
      last_success_at = excluded.last_success_at
  `);

  // Substitui o estado ativo e os metadados em uma única transação.
  db.transaction((records) => {
    deactivateMatches.run();

    for (const match of records) {
      upsertMatch.run({
        ...match,
        teamsJson: JSON.stringify(match.teams),
        fetchedAt,
      });
    }

    upsertMetadata.run({ fetchedAt });
  })(matches);

  return hydrateCsgoScoreCache(db);
}
