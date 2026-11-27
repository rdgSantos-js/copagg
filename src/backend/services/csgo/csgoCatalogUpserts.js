// Prepara os upserts compartilhados pelos sincronizadores de catálogo e partidas.
export function createCsgoCatalogUpserts(db) {
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
