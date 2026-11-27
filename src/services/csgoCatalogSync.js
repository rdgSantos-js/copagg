// ------------------------------------------------------------------------------------------
// Sincroniza catálogos públicos de ligas, séries e torneios da PandaScore para o SQLite.
// ------------------------------------------------------------------------------------------




import { getDatabase } from "../db/database.js";
import {
  mapCsgoLeague,
  mapCsgoSeries,
  mapCsgoTournament,
} from "./csgoScoreMapper.js";
import { recordPandaScoreError } from "../integrations/pandascore/errorLog.js";
import { PANDASCORE_ENDPOINTS } from "../integrations/pandascore/endpoints.js";

const PAGE_SIZE = 100;
const CATALOGS = [
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

// Upserts preservam metadados conhecidos quando respostas parciais trazem campos nulos.
function createUpserts(db) {
  return {
    league: db.prepare(`
      INSERT INTO leagues (id, name, slug)
      VALUES (@id, @name, @slug)
      ON CONFLICT(id) DO UPDATE SET
        name = COALESCE(excluded.name, leagues.name),
        slug = COALESCE(excluded.slug, leagues.slug)
    `),
    series: db.prepare(`
      INSERT INTO series (id, league_id, name, slug, begin_at, end_at)
      VALUES (@id, @leagueId, @name, @slug, @beginAt, @endAt)
      ON CONFLICT(id) DO UPDATE SET
        league_id = COALESCE(excluded.league_id, series.league_id),
        name = COALESCE(excluded.name, series.name),
        slug = COALESCE(excluded.slug, series.slug),
        begin_at = COALESCE(excluded.begin_at, series.begin_at),
        end_at = COALESCE(excluded.end_at, series.end_at)
    `),
    tournament: db.prepare(`
      INSERT INTO tournaments
        (id, series_id, name, slug, tier, begin_at, end_at)
      VALUES
        (@id, @seriesId, @name, @slug, @tier, @beginAt, @endAt)
      ON CONFLICT(id) DO UPDATE SET
        series_id = COALESCE(excluded.series_id, tournaments.series_id),
        name = COALESCE(excluded.name, tournaments.name),
        slug = COALESCE(excluded.slug, tournaments.slug),
        tier = COALESCE(excluded.tier, tournaments.tier),
        begin_at = COALESCE(excluded.begin_at, tournaments.begin_at),
        end_at = COALESCE(excluded.end_at, tournaments.end_at)
    `),
  };
}

// Persiste uma entidade e seus pais antes de inserir suas chaves estrangeiras.
function persistCatalogRecord(record, type, upserts) {
  if (type === "league") {
    const league = mapCsgoLeague(record);
    if (!league) {
      throw new TypeError("PandaScore returned a league without a valid id.");
    }

    upserts.league.run({
      id: league.id,
      name: league.name,
      slug: league.slug,
    });

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
      upserts.league.run({
        id: league.id,
        name: league.name,
        slug: league.slug,
      });
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
    upserts.league.run({
      id: league.id,
      name: league.name,
      slug: league.slug,
    });
  }

  if (Number.isInteger(seriesId)) {
    const series = mapCsgoSeries(rawSeries, { id: seriesId, leagueId });
    upserts.series.run(series);
  }

  const tournament = mapCsgoTournament(record, { seriesId });
  upserts.tournament.run(tournament);
}

// Sincroniza um catálogo paginado e atualiza seu horário apenas após a conclusão.
async function syncCatalog(client, db, catalog, now) {
  const upserts = createUpserts(db);
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
