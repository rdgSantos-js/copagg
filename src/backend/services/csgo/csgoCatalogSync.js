// ------------------------------------------------------------------------------------------
// Sincroniza os videogames e catálogos de competição da PandaScore para o SQLite.
// ------------------------------------------------------------------------------------------




import { getDatabase } from "../../db/database.js";
import {
  mapCsgoLeague,
  mapCsgoSeries,
  mapCsgoTournament,
  mapPandaScoreVideogame,
} from "./csgoScoreMapper.js";
import { createCsgoCatalogUpserts } from "./csgoCatalogUpserts.js";
import { recordPandaScoreError } from "../../integrations/pandascore/errorLog.js";
import { PANDASCORE_ENDPOINTS } from "../../integrations/pandascore/endpoints.js";

const PAGE_SIZE = 100;
const CATALOGS = [
  {
    key: "videogames",
    endpoint: PANDASCORE_ENDPOINTS.videogames,
    type: "videogame",
  },
  {
    key: "csgo_leagues",
    endpoint: PANDASCORE_ENDPOINTS.csgo.leagues,
    type: "league",
  },
  {
    key: "csgo_series",
    endpoint: PANDASCORE_ENDPOINTS.csgo.series,
    type: "series",
  },
  {
    key: "csgo_tournaments",
    endpoint: PANDASCORE_ENDPOINTS.csgo.upcomingTournaments,
    type: "tournament",
  },
];

function persistLeague(league, upserts) {
  upserts.videogame.run({
    ...league.videogame,
    pandascoreId: null,
  });
  const videogame = upserts.getVideogame.get(league.videogame.slug);
  if (!videogame) {
    throw new Error("Could not resolve the persisted videogame.");
  }

  upserts.league.run({
    id: league.id,
    name: league.name,
    slug: league.slug,
    url: league.url,
    imageUrl: league.imageUrl,
    videogameId: videogame.id,
  });
}

// Persiste uma entidade e seus pais antes de inserir suas chaves estrangeiras.
function persistCatalogRecord(record, type, upserts) {
  if (type === "videogame") {
    const videogame = mapPandaScoreVideogame(record);
    if (!videogame) {
      throw new TypeError("PandaScore returned an invalid videogame.");
    }

    upserts.videogame.run(videogame);
    return;
  }

  if (type === "league") {
    const league = mapCsgoLeague(record);
    if (!league) {
      throw new TypeError("PandaScore returned a league without a valid id.");
    }

    persistLeague(league, upserts);

    for (const rawSeries of Array.isArray(record.series) ? record.series : []) {
      const series = mapCsgoSeries(rawSeries, { leagueId: league.id });
      upserts.series.run(series);
    }
    return;
  }

  if (type === "series") {
    const rawLeague = record.league;
    const leagueId = record.league_id ?? rawLeague?.id ?? null;
    const league = mapCsgoLeague(
      rawLeague ?? (Number.isInteger(leagueId) ? { id: leagueId } : null),
    );
    if (league) {
      persistLeague(league, upserts);
    }

    const series = mapCsgoSeries(record, { leagueId });
    upserts.series.run(series);
    return;
  }

  const rawSeries = record.serie;
  const rawLeague = record.league ?? rawSeries?.league;
  const seriesId =
    rawSeries?.id ?? record.serie_id ?? record.series_id ?? null;
  const leagueId =
    rawLeague?.id ?? rawSeries?.league_id ?? record.league_id ?? null;
  const league = mapCsgoLeague(
    rawLeague ?? (Number.isInteger(leagueId) ? { id: leagueId } : null),
  );
  if (league) {
    persistLeague(league, upserts);
  }

  if (Number.isInteger(seriesId)) {
    const series = mapCsgoSeries(rawSeries, { id: seriesId, leagueId });
    upserts.series.run(series);
  }

  const tournament = mapCsgoTournament(record, { seriesId, leagueId });
  upserts.tournament.run(tournament);
}

// Sincroniza um catálogo paginado e atualiza seu horário apenas após a conclusão.
async function syncCatalog(client, db, catalog, now) {
  const upserts = createCsgoCatalogUpserts(db);
  const persistPage = db.transaction((records) => {
    for (const record of records) {
      persistCatalogRecord(record, catalog.type, upserts);
    }
  });
  let page = 1;
  let total = 0;

  while (true) {
    let response;
    try {
      response = await client.get(catalog.endpoint, {
        params: {
          page,
          per_page: PAGE_SIZE,
        },
      });
    } catch (error) {
      recordPandaScoreError(db, error, {
        endpoint: catalog.endpoint,
        page,
        now,
      });
      throw error;
    }

    if (!response || !Array.isArray(response.data)) {
      const error = new TypeError("PandaScore returned an invalid catalog response.");
      recordPandaScoreError(db, error, {
        endpoint: catalog.endpoint,
        page,
        category: "invalid_response",
        now,
      });
      throw error;
    }

    try {
      persistPage(response.data);
    } catch (error) {
      recordPandaScoreError(db, error, {
        endpoint: catalog.endpoint,
        page,
        category: "invalid_response",
        now,
      });
      throw error;
    }

    total += response.data.length;
    if (response.data.length < PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  const fetchedAt = now().toISOString();
  db.prepare(`
    INSERT INTO sync_metadata (sync_key, last_success_at)
    VALUES (@syncKey, @fetchedAt)
    ON CONFLICT(sync_key) DO UPDATE SET
      last_success_at = excluded.last_success_at
  `).run({ syncKey: catalog.key, fetchedAt });

  return { catalog: catalog.type, total };
}

// Atualiza os catálogos de ligas, séries e torneios disponíveis no plano Free.
export async function syncCsgoCatalog({
  client,
  db = getDatabase(),
  now = () => new Date(),
} = {}) {
  if (!client || typeof client.get !== "function") {
    throw new TypeError("A PandaScore-compatible HTTP client is required.");
  }

  const results = [];
  for (const catalog of CATALOGS) {
    results.push(await syncCatalog(client, db, catalog, now));
  }
  return results;
}
