// ------------------------------------------------------------------------------------------
// Gerencia a cópia em memória dos placares ativos. Ao iniciar ou após uma sincronização,
// lê do SQLite apenas as partidas marcadas como em andamento e o horário da última
// atualização bem-sucedida. Devolve uma cópia independente dos dados para impedir que uma
// rota altere acidentalmente o estado compartilhado.
// ------------------------------------------------------------------------------------------




import { getDatabase } from "../../db/database.js";

// Armazena o snapshot compartilhado de placares para as rotas locais.
let cache = {
  matches: [],
  updatedAt: null,
};

// Reconstrói o cache em memória usando apenas os registros persistidos no SQLite.
export function hydrateCsgoScoreCache(db = getDatabase()) {
  const rows = db
    .prepare(
      `SELECT
         m.id AS match_id,
         m.name AS match_name,
         m.status AS match_status,
         m.begin_at AS match_begin_at,
         m.expected_begin_at AS match_expected_begin_at,
         m.end_at AS match_end_at,
         m.league_id AS match_league_id,
         m.series_id AS match_series_id,
         m.slug AS match_slug,
         m.scheduled_at AS match_scheduled_at,
         m.original_scheduled_at AS match_original_scheduled_at,
         m.detailed_stats AS match_detailed_stats,
         m.draw AS match_draw,
         m.forfeit AS match_forfeit,
         m.game_advantage AS match_game_advantage,
         m.match_type AS match_type,
         m.modified_at AS match_modified_at,
         m.number_of_games AS match_number_of_games,
         m.rescheduled AS match_rescheduled,
         m.videogame_title_id AS match_videogame_title_id,
         m.videogame_title_name AS match_videogame_title_name,
         m.videogame_title_slug AS match_videogame_title_slug,
         m.videogame_title_videogame_id AS match_videogame_title_videogame_id,
         m.videogame_version_current AS match_videogame_version_current,
         m.videogame_version_name AS match_videogame_version_name,
         m.winner_id AS match_winner_id,
         m.winner_type AS match_winner_type,
         match_vg.id AS match_videogame_local_id,
         match_vg.pandascore_id AS match_videogame_id,
         match_vg.name AS match_videogame_name,
         match_vg.slug AS match_videogame_slug,
         winner_team.id AS winner_team_id,
         winner_team.name AS winner_team_name,
         winner_team.slug AS winner_team_slug,
         winner_team.acronym AS winner_team_acronym,
         winner_team.image_url AS winner_team_image_url,
         winner_team.dark_mode_image_url AS winner_team_dark_mode_image_url,
         winner_team.location AS winner_team_location,
         winner_team.modified_at AS winner_team_modified_at,
         t.id AS tournament_id,
         t.name AS tournament_name,
         t.slug AS tournament_slug,
         t.tier AS tournament_tier,
         t.league_id AS tournament_league_id,
         t.type AS tournament_type,
         t.country AS tournament_country,
         t.detailed_stats AS tournament_detailed_stats,
         t.winner_id AS tournament_winner_id,
         t.winner_type AS tournament_winner_type,
         t.region AS tournament_region,
         t.modified_at AS tournament_modified_at,
         t.prizepool AS tournament_prizepool,
         t.has_bracket AS tournament_has_bracket,
         t.live_supported AS tournament_live_supported,
         s.id AS series_id,
         s.name AS series_name,
         s.slug AS series_slug,
         s.full_name AS series_full_name,
         s.modified_at AS series_modified_at,
         s.season AS series_season,
         s.winner_id AS series_winner_id,
         s.winner_type AS series_winner_type,
         s.year AS series_year,
         l.id AS league_id,
         l.name AS league_name,
         l.slug AS league_slug,
         l.url AS league_url,
         l.image_url AS league_image_url,
         vg.id AS videogame_id,
         vg.name AS videogame_name,
         vg.slug AS videogame_slug,
         team.id AS team_id,
         team.name AS team_name,
         team.slug AS team_slug,
         team.acronym AS team_acronym,
         team.image_url AS team_image_url,
         team.dark_mode_image_url AS team_dark_mode_image_url,
         team.location AS team_location,
         team.modified_at AS team_modified_at,
         mt.opponent_type AS opponent_type,
         mt.score AS team_score
       FROM matches m
       LEFT JOIN videogames match_vg ON match_vg.id = m.videogame_id
       LEFT JOIN teams winner_team
         ON m.winner_type = 'Team' AND winner_team.id = m.winner_id
       LEFT JOIN tournaments t ON t.id = m.tournament_id
       LEFT JOIN series s ON s.id = t.series_id
       LEFT JOIN leagues l ON l.id = s.league_id
       LEFT JOIN videogames vg ON vg.id = l.videogame_id
       LEFT JOIN match_teams mt ON mt.match_id = m.id
       LEFT JOIN teams team ON team.id = mt.team_id
       WHERE m.is_running = 1
       ORDER BY m.begin_at, m.id, team.id`,
    )
    .all();
  const metadata = db
    .prepare(
      "SELECT last_success_at FROM sync_metadata WHERE sync_key = ?",
    )
    .get("csgo_running");

  const matches = new Map();

  for (const row of rows) {
    let match = matches.get(row.match_id);
    if (!match) {
      match = {
        matchId: row.match_id,
        leagueId: row.match_league_id ?? row.league_id,
        seriesId: row.match_series_id ?? row.series_id,
        tournamentId: row.tournament_id,
        slug: row.match_slug,
        name: row.match_name,
        status: row.match_status,
        beginAt: row.match_begin_at ?? row.match_expected_begin_at,
        expectedBeginAt: row.match_expected_begin_at,
        endAt: row.match_end_at,
        scheduledAt: row.match_scheduled_at,
        originalScheduledAt: row.match_original_scheduled_at,
        detailedStats:
          row.match_detailed_stats === null
            ? null
            : Boolean(row.match_detailed_stats),
        draw: row.match_draw === null ? null : Boolean(row.match_draw),
        forfeit: row.match_forfeit === null ? null : Boolean(row.match_forfeit),
        gameAdvantage: row.match_game_advantage,
        matchType: row.match_type,
        modifiedAt: row.match_modified_at,
        numberOfGames: row.match_number_of_games,
        rescheduled:
          row.match_rescheduled === null
            ? null
            : Boolean(row.match_rescheduled),
        videogame: row.match_videogame_local_id
          ? {
              id: row.match_videogame_id ?? row.match_videogame_local_id,
              name: row.match_videogame_name,
              slug: row.match_videogame_slug,
            }
          : null,
        videogameTitle:
          row.match_videogame_title_id !== null
            ? {
                id: row.match_videogame_title_id,
                name: row.match_videogame_title_name,
                slug: row.match_videogame_title_slug,
                videogameId: row.match_videogame_title_videogame_id,
              }
            : null,
        videogameVersion:
          row.match_videogame_version_name !== null ||
          row.match_videogame_version_current !== null
            ? {
                current:
                  row.match_videogame_version_current === null
                    ? null
                    : Boolean(row.match_videogame_version_current),
                name: row.match_videogame_version_name,
              }
            : null,
        winner:
          row.winner_team_id !== null
            ? {
                id: row.winner_team_id,
                name: row.winner_team_name,
                slug: row.winner_team_slug,
                acronym: row.winner_team_acronym,
                imageUrl: row.winner_team_image_url,
                darkModeImageUrl: row.winner_team_dark_mode_image_url,
                location: row.winner_team_location,
                modifiedAt: row.winner_team_modified_at,
              }
            : null,
        winnerId: row.match_winner_id,
        winnerType: row.match_winner_type,
        league: row.league_id
          ? {
              id: row.league_id,
              name: row.league_name,
              slug: row.league_slug,
              url: row.league_url,
              imageUrl: row.league_image_url,
              videogame: row.videogame_id
                ? {
                    id: row.videogame_id,
                    name: row.videogame_name,
                    slug: row.videogame_slug,
                  }
                : null,
            }
          : null,
        series: row.series_id
          ? {
              id: row.series_id,
              name: row.series_name,
              slug: row.series_slug,
              fullName: row.series_full_name,
              modifiedAt: row.series_modified_at,
              season: row.series_season,
              winnerId: row.series_winner_id,
              winnerType: row.series_winner_type,
              year: row.series_year,
            }
          : null,
        tournament: row.tournament_id
          ? {
              id: row.tournament_id,
              name: row.tournament_name,
              slug: row.tournament_slug,
              tier: row.tournament_tier,
              leagueId: row.tournament_league_id,
              type: row.tournament_type,
              country: row.tournament_country,
              detailedStats:
                row.tournament_detailed_stats === null
                  ? null
                  : Boolean(row.tournament_detailed_stats),
              winnerId: row.tournament_winner_id,
              winnerType: row.tournament_winner_type,
              region: row.tournament_region,
              modifiedAt: row.tournament_modified_at,
              prizepool: row.tournament_prizepool,
              hasBracket:
                row.tournament_has_bracket === null
                  ? null
                  : Boolean(row.tournament_has_bracket),
              liveSupported:
                row.tournament_live_supported === null
                  ? null
                  : Boolean(row.tournament_live_supported),
            }
          : null,
        opponents: [],
        results: [],
        streamsList: [],
        teams: [],
      };
      matches.set(row.match_id, match);
    }

    if (row.team_id !== null) {
      match.teams.push({
        id: row.team_id,
        name: row.team_name,
        slug: row.team_slug,
        acronym: row.team_acronym,
        imageUrl: row.team_image_url,
        darkModeImageUrl: row.team_dark_mode_image_url,
        location: row.team_location,
        modifiedAt: row.team_modified_at,
        type: row.opponent_type,
        score: row.team_score,
      });
      match.opponents.push({
        type: row.opponent_type,
        opponent: {
          id: row.team_id,
          name: row.team_name,
          slug: row.team_slug,
          acronym: row.team_acronym,
          imageUrl: row.team_image_url,
          darkModeImageUrl: row.team_dark_mode_image_url,
          location: row.team_location,
          modifiedAt: row.team_modified_at,
        },
      });
      if (row.team_score !== null) {
        match.results.push({ teamId: row.team_id, score: row.team_score });
      }
    }
  }

  const streamRows = db.prepare(`
    SELECT match_id AS matchId, position, embed_url AS embedUrl, language,
           main, official, raw_url AS rawUrl
    FROM match_streams
    WHERE match_id IN (SELECT id FROM matches WHERE is_running = 1)
    ORDER BY match_id, position
  `).all();
  for (const stream of streamRows) {
    const match = matches.get(stream.matchId);
    if (match) {
      match.streamsList.push({
        embedUrl: stream.embedUrl,
        language: stream.language,
        main: stream.main === null ? null : Boolean(stream.main),
        official: stream.official === null ? null : Boolean(stream.official),
        rawUrl: stream.rawUrl,
      });
    }
  }

  cache = {
    matches: [...matches.values()],
    updatedAt: metadata?.last_success_at ?? null,
  };

  return getCsgoScoreCache();
}

// Retorna uma cópia do snapshot para evitar alterações no estado compartilhado.
export function getCsgoScoreCache() {
  return structuredClone(cache);
}
