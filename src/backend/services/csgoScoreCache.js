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
      `SELECT
         m.id AS match_id,
         m.name AS match_name,
         m.status AS match_status,
         m.begin_at AS match_begin_at,
         m.expected_begin_at AS match_expected_begin_at,
         m.end_at AS match_end_at,
         t.id AS tournament_id,
         t.name AS tournament_name,
         t.slug AS tournament_slug,
         t.tier AS tournament_tier,
         s.id AS series_id,
         s.name AS series_name,
         s.slug AS series_slug,
         l.id AS league_id,
         l.name AS league_name,
         l.slug AS league_slug,
         vg.id AS videogame_id,
         vg.name AS videogame_name,
         vg.slug AS videogame_slug,
         team.id AS team_id,
         team.name AS team_name,
         team.slug AS team_slug,
         team.acronym AS team_acronym,
         team.image_url AS team_image_url,
         mt.score AS team_score
       FROM matches m
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
        name: row.match_name,
        status: row.match_status,
        beginAt: row.match_begin_at ?? row.match_expected_begin_at,
        expectedBeginAt: row.match_expected_begin_at,
        endAt: row.match_end_at,
        league: row.league_id
          ? {
              id: row.league_id,
              name: row.league_name,
              slug: row.league_slug,
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
            }
          : null,
        tournament: row.tournament_id
          ? {
              id: row.tournament_id,
              name: row.tournament_name,
              slug: row.tournament_slug,
              tier: row.tournament_tier,
            }
          : null,
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
        score: row.team_score,
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
