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
const MATCH_SYNC_CONFIG = {
  upcoming: {
    endpoint: PANDASCORE_ENDPOINTS.csgo.upcomingMatches,
    syncKey: "csgo_upcoming",
  },
  running: {
    endpoint: PANDASCORE_ENDPOINTS.csgo.runningMatches,
    syncKey: "csgo_running",
  },
  past: {
    endpoint: PANDASCORE_ENDPOINTS.csgo.pastMatches,
    syncKey: "csgo_past",
  },
};

// Busca partidas de um estado e limita o histórico passado aos últimos 30 dias.
async function fetchMatches(client, db, now, state, config) {
  const matches = [];
  let page = 1;
  const pastCutoff =
    state === "past"
      ? new Date(now().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

  while (true) {
    let response;
    try {
      response = await client.get(config.endpoint, {
        params: {
          page,
          per_page: PAGE_SIZE,
          ...(state === "past" ? { sort: "-begin_at" } : {}),
        },
      });
    } catch (error) {
      recordPandaScoreError(db, error, {
        endpoint: config.endpoint,
        page,
        now,
      });
      throw error;
    }

    if (!response || !Array.isArray(response.data)) {
      const stateLabel =
        state === "running" ? "running-matches" : `${state}-matches`;
      const error = new TypeError(
        `PandaScore returned an invalid ${stateLabel} response.`,
      );
      recordPandaScoreError(db, error, {
        endpoint: config.endpoint,
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
        endpoint: config.endpoint,
        page,
        category: "invalid_response",
        now,
      });
      throw error;
    }

    const filteredPage =
      pastCutoff === null
        ? mappedPage
        : mappedPage.filter((match) => {
            const date = match.beginAt ?? match.endAt;
            return date !== null && date >= pastCutoff;
          });
    matches.push(...filteredPage);

    if (
      state === "past" &&
      mappedPage.length > 0 &&
      filteredPage.length === 0
    ) {
      return matches;
    }

    if (response.data.length < PAGE_SIZE) {
      return matches;
    }

    page += 1;
  }
}

// Sincroniza um estado de partidas e persiste sua hierarquia em uma transação.
export async function syncCsgoMatches({
  state = "running",
  client,
  db = getDatabase(),
  now = () => new Date(),
} = {}) {
  if (!client || typeof client.get !== "function") {
    throw new TypeError("A PandaScore-compatible HTTP client is required.");
  }
  const config = MATCH_SYNC_CONFIG[state];
  if (!config) {
    throw new TypeError("Match state must be upcoming, running, or past.");
  }

  const matches = await fetchMatches(client, db, now, state, config);
  const fetchedAt = now().toISOString();

  const deactivateMatches = db.prepare(
    "UPDATE matches SET is_running = 0",
  );
  const upsertVideogame = db.prepare(`
    INSERT INTO videogames (pandascore_id, name, slug)
    VALUES (@pandascoreId, @name, @slug)
    ON CONFLICT(slug) DO UPDATE SET
      pandascore_id = COALESCE(
        excluded.pandascore_id,
        videogames.pandascore_id
      ),
      name = COALESCE(excluded.name, videogames.name)
  `);
  const getVideogame = db.prepare("SELECT id FROM videogames WHERE slug = ?");
  const upsertLeague = db.prepare(`
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
  `);
  const upsertSeries = db.prepare(`
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
  `);
  const upsertTournament = db.prepare(`
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
  `);
  const upsertTeam = db.prepare(`
    INSERT INTO teams (id, name, slug, acronym, image_url)
    VALUES (@id, @name, @slug, @acronym, @imageUrl)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      slug = COALESCE(excluded.slug, teams.slug),
      acronym = COALESCE(excluded.acronym, teams.acronym),
      image_url = COALESCE(excluded.image_url, teams.image_url)
  `);
  const upsertMatch = db.prepare(`
    INSERT INTO matches
      (id, tournament_id, name, status, begin_at, expected_begin_at,
       end_at, is_running, fetched_at)
    VALUES
      (@matchId, @tournamentId, @name, @status, @beginAt,
       @expectedBeginAt, @endAt, @isRunning, @fetchedAt)
    ON CONFLICT(id) DO UPDATE SET
      tournament_id = COALESCE(excluded.tournament_id, matches.tournament_id),
      name = COALESCE(excluded.name, matches.name),
      status = excluded.status,
      begin_at = COALESCE(excluded.begin_at, matches.begin_at),
      expected_begin_at = COALESCE(
        excluded.expected_begin_at,
        matches.expected_begin_at
      ),
      end_at = COALESCE(excluded.end_at, matches.end_at),
      is_running = CASE
        WHEN @updateRunningStatus = 1 THEN excluded.is_running
        ELSE matches.is_running
      END,
      fetched_at = excluded.fetched_at
  `);
  const deleteMatchTeams = db.prepare(
    "DELETE FROM match_teams WHERE match_id = ?",
  );
  const upsertMatchTeam = db.prepare(`
    INSERT INTO match_teams (match_id, team_id, score)
    VALUES (@matchId, @teamId, @score)
    ON CONFLICT(match_id, team_id) DO UPDATE SET score = excluded.score
  `);
  const deleteGames = db.prepare("DELETE FROM games WHERE match_id = ?");
  const upsertGame = db.prepare(`
    INSERT INTO games
      (id, match_id, position, status, begin_at, end_at, length,
       winner_id, winner_type)
    VALUES
      (@id, @matchId, @position, @status, @beginAt, @endAt, @length,
       @winnerId, @winnerType)
    ON CONFLICT(id) DO UPDATE SET
      match_id = excluded.match_id,
      position = excluded.position,
      status = excluded.status,
      begin_at = excluded.begin_at,
      end_at = excluded.end_at,
      length = excluded.length,
      winner_id = excluded.winner_id,
      winner_type = excluded.winner_type
  `);
  const upsertGameTeam = db.prepare(`
    INSERT INTO game_teams (game_id, team_id, score)
    VALUES (@gameId, @teamId, @score)
    ON CONFLICT(game_id, team_id) DO UPDATE SET score = excluded.score
  `);
  const upsertMetadata = db.prepare(`
    INSERT INTO sync_metadata (sync_key, last_success_at)
    VALUES (@syncKey, @fetchedAt)
    ON CONFLICT(sync_key) DO UPDATE SET
      last_success_at = excluded.last_success_at
  `);

  // Persiste a hierarquia, participantes, jogos e metadados em uma transação.
  db.transaction((records) => {
    if (state === "running") {
      deactivateMatches.run();
    }

    for (const match of records) {
      if (match.league) {
        upsertVideogame.run({
          ...match.league.videogame,
          pandascoreId: null,
        });
        const videogame = getVideogame.get(match.league.videogame.slug);
        if (!videogame) {
          throw new Error("Could not resolve the persisted videogame.");
        }
        upsertLeague.run({
          ...match.league,
          videogameId: videogame.id,
        });
      }

      if (match.series) {
        upsertSeries.run(match.series);
      }

      if (match.tournament) {
        upsertTournament.run(match.tournament);
      }

      for (const team of match.teams) {
        upsertTeam.run(team);
      }

      upsertMatch.run({
        matchId: match.matchId,
        tournamentId: match.tournamentId,
        name: match.name,
        status: match.status,
        beginAt: match.beginAt,
        expectedBeginAt: match.expectedBeginAt,
        endAt: match.endAt,
        isRunning: state === "running" && match.status === "running" ? 1 : 0,
        updateRunningStatus: state === "running" ? 1 : 0,
        fetchedAt,
      });

      deleteMatchTeams.run(match.matchId);
      for (const team of match.teams) {
        upsertMatchTeam.run({
          matchId: match.matchId,
          teamId: team.id,
          score: team.score,
        });
      }

      if (match.games !== null) {
        deleteGames.run(match.matchId);

        for (const game of match.games) {
          upsertGame.run({
            ...game,
            matchId: match.matchId,
          });

          for (const result of game.results) {
            if (!match.teams.some((team) => team.id === result.teamId)) {
              upsertTeam.run({
                id: result.teamId,
                name: "Unknown team",
                slug: null,
                acronym: null,
                imageUrl: null,
              });
            }

            upsertGameTeam.run({
              gameId: game.id,
              teamId: result.teamId,
              score: result.score,
            });
          }
        }
      }
    }

    upsertMetadata.run({ syncKey: config.syncKey, fetchedAt });
  })(matches);

  return hydrateCsgoScoreCache(db);
}

// Mantém a função anterior como atalho para sincronizar partidas ao vivo.
export function syncCsgoLiveScores(options = {}) {
  return syncCsgoMatches({
    ...options,
    state: "running",
  });
}
