// ------------------------------------------------------------------------------------------
// Sincroniza os videogames e catálogos de competição da PandaScore para o SQLite.
// ------------------------------------------------------------------------------------------




import { getDatabase } from "../db/database.js";
import {
  mapCsgoLeague,
  mapCsgoSeries,
  mapCsgoTournament,
  mapPandaScoreVideogame,
} from "./csgoScoreMapper.js";
import { recordPandaScoreError } from "../integrations/pandascore/errorLog.js";
import { PANDASCORE_ENDPOINTS } from "../integrations/pandascore/endpoints.js";

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

// Upserts preservam metadados conhecidos quando respostas parciais trazem campos nulos.
function createUpserts(db) {
  return {
    videogame: db.prepare(`
      INSERT INTO videogames (pandascore_id, name, slug)
      VALUES (@pandascoreId, @name, @slug)
      ON CONFLICT(slug) DO UPDATE SET
        pandascore_id = COALESCE(
          excluded.pandascore_id,
          videogames.pandascore_id
        ),
        name = COALESCE(excluded.name, videogames.name)
    `),
    getVideogame: db.prepare("SELECT id FROM videogames WHERE slug = ?"),
    league: db.prepare(`
      INSERT INTO leagues
        (id, name, slug, url, image_url, videogame_id)
      VALUES
        (@id, @name, @slug, @url, @imageUrl, @videogameId)
      ON CONFLICT(id) DO UPDATE SET
        name = COALESCE(excluded.name, leagues.name),
        slug = COALESCE(excluded.slug, leagues.slug),
        url = COALESCE(excluded.url, leagues.url),
        image_url = COALESCE(excluded.image_url, leagues.image_url),
        videogame_id = COALESCE(excluded.videogame_id, leagues.videogame_id)
    `),
    series: db.prepare(`
      INSERT INTO series
        (id, league_id, name, slug, begin_at, end_at, full_name, modified_at,
         season, winner_id, winner_type, year)
      VALUES
        (@id, @leagueId, @name, @slug, @beginAt, @endAt, @fullName, @modifiedAt,
         @season, @winnerId, @winnerType, @year)
      ON CONFLICT(id) DO UPDATE SET
        league_id = COALESCE(excluded.league_id, series.league_id),
        name = COALESCE(excluded.name, series.name),
        slug = COALESCE(excluded.slug, series.slug),
        begin_at = COALESCE(excluded.begin_at, series.begin_at),
        end_at = COALESCE(excluded.end_at, series.end_at),
        full_name = COALESCE(excluded.full_name, series.full_name),
        modified_at = COALESCE(excluded.modified_at, series.modified_at),
        season = COALESCE(excluded.season, series.season),
        winner_id = COALESCE(excluded.winner_id, series.winner_id),
        winner_type = COALESCE(excluded.winner_type, series.winner_type),
        year = COALESCE(excluded.year, series.year)
    `),
    tournament: db.prepare(`
      INSERT INTO tournaments
        (id, series_id, league_id, name, slug, tier, begin_at, end_at,
         type, country, detailed_stats, winner_id, winner_type, region,
         modified_at, prizepool, has_bracket, live_supported)
      VALUES
        (@id, @seriesId, @leagueId, @name, @slug, @tier, @beginAt, @endAt,
         @type, @country, @detailedStats, @winnerId, @winnerType, @region,
         @modifiedAt, @prizepool, @hasBracket, @liveSupported)
      ON CONFLICT(id) DO UPDATE SET
        series_id = COALESCE(excluded.series_id, tournaments.series_id),
        league_id = COALESCE(excluded.league_id, tournaments.league_id),
        name = COALESCE(excluded.name, tournaments.name),
        slug = COALESCE(excluded.slug, tournaments.slug),
        tier = COALESCE(excluded.tier, tournaments.tier),
        begin_at = COALESCE(excluded.begin_at, tournaments.begin_at),
        end_at = COALESCE(excluded.end_at, tournaments.end_at),
        type = COALESCE(excluded.type, tournaments.type),
        country = COALESCE(excluded.country, tournaments.country),
        detailed_stats = COALESCE(excluded.detailed_stats, tournaments.detailed_stats),
        winner_id = COALESCE(excluded.winner_id, tournaments.winner_id),
        winner_type = COALESCE(excluded.winner_type, tournaments.winner_type),
        region = COALESCE(excluded.region, tournaments.region),
        modified_at = COALESCE(excluded.modified_at, tournaments.modified_at),
        prizepool = COALESCE(excluded.prizepool, tournaments.prizepool),
        has_bracket = COALESCE(excluded.has_bracket, tournaments.has_bracket),
        live_supported = COALESCE(excluded.live_supported, tournaments.live_supported)
    `),
  };
}

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
