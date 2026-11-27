// ------------------------------------------------------------------------------------------
// Consulta a hierarquia competitiva, partidas e jogos persistidos no SQLite.
// ------------------------------------------------------------------------------------------




import { getDatabase } from "../db/database.js";

const ENTITY_QUERIES = {
  leagues: {
    from:
      "leagues l LEFT JOIN videogames vg ON vg.id = l.videogame_id",
    select:
      "l.id, l.name, l.slug, l.url, l.image_url AS imageUrl, vg.id AS videogameId, vg.name AS videogameName, vg.slug AS videogameSlug",
    orderBy: "l.name, l.id",
    search: "(l.name LIKE ? OR l.slug LIKE ?)",
    idColumn: "l.id",
    upcomingColumn: null,
    parentColumn: null,
  },
  series: {
    from: "series s LEFT JOIN leagues l ON l.id = s.league_id",
    select:
      "s.id, s.league_id AS leagueId, s.name, s.slug, s.begin_at AS beginAt, s.end_at AS endAt, s.full_name AS fullName, s.modified_at AS modifiedAt, s.season, s.winner_id AS winnerId, s.winner_type AS winnerType, s.year, l.name AS leagueName",
    orderBy: "s.begin_at DESC, s.id",
    search: "(s.name LIKE ? OR s.slug LIKE ?)",
    idColumn: "s.id",
    upcomingColumn: null,
    parentColumn: "s.league_id",
  },
  tournaments: {
    from:
      "tournaments t LEFT JOIN series s ON s.id = t.series_id",
    select:
      "t.id, t.series_id AS seriesId, t.name, t.slug, t.tier, t.begin_at AS beginAt, t.end_at AS endAt, s.name AS seriesName",
    orderBy: "t.begin_at, t.id",
    search: "(t.name LIKE ? OR t.slug LIKE ?)",
    idColumn: "t.id",
    upcomingColumn: "t.begin_at",
    parentColumn: "t.series_id",
  },
};

const ENTITY_DATE_COLUMNS = {
  leagues: {},
  series: {
    begin_at: "s.begin_at",
    end_at: "s.end_at",
  },
  tournaments: {
    begin_at: "t.begin_at",
    end_at: "t.end_at",
  },
};

const MATCH_DATE_COLUMNS = {
  begin_at: "m.begin_at",
  expected_begin_at: "m.expected_begin_at",
  end_at: "m.end_at",
};

const GAME_DATE_COLUMNS = {
  begin_at: "g.begin_at",
  end_at: "g.end_at",
};

const MATCH_SELECT = `
  SELECT
    m.id AS matchId,
    m.tournament_id AS tournamentId,
    m.name,
    m.status,
    m.begin_at AS beginAt,
    m.expected_begin_at AS expectedBeginAt,
    m.end_at AS endAt,
    t.name AS tournamentName,
    t.slug AS tournamentSlug,
    t.tier AS tournamentTier,
    s.id AS seriesId,
    s.name AS seriesName,
    s.slug AS seriesSlug,
    s.full_name AS seriesFullName,
    s.modified_at AS seriesModifiedAt,
    s.season AS seriesSeason,
    s.winner_id AS seriesWinnerId,
    s.winner_type AS seriesWinnerType,
    s.year AS seriesYear,
    l.id AS leagueId,
    l.name AS leagueName,
    l.slug AS leagueSlug,
    l.url AS leagueUrl,
    l.image_url AS leagueImageUrl,
    vg.id AS videogameId,
    vg.name AS videogameName,
    vg.slug AS videogameSlug,
    team.id AS teamId,
    team.name AS teamName,
    team.slug AS teamSlug,
    team.acronym AS teamAcronym,
    team.image_url AS teamImageUrl,
    mt.score AS teamScore
  FROM matches m
  LEFT JOIN tournaments t ON t.id = m.tournament_id
  LEFT JOIN series s ON s.id = t.series_id
  LEFT JOIN leagues l ON l.id = s.league_id
  LEFT JOIN videogames vg ON vg.id = l.videogame_id
  LEFT JOIN match_teams mt ON mt.match_id = m.id
  LEFT JOIN teams team ON team.id = mt.team_id
`;

function mapEntityRow(type, row) {
  if (type !== "leagues") {
    return row;
  }

  const {
    videogameId,
    videogameName,
    videogameSlug,
    ...league
  } = row;
  return {
    ...league,
    videogame: videogameId
      ? { id: videogameId, name: videogameName, slug: videogameSlug }
      : null,
  };
}

// Valida a paginação local, mantendo os limites da documentação PandaScore.
export function parseLocalPagination(query) {
  const rawPage = query.page ?? query["page[number]"] ?? "1";
  const rawPerPage =
    query.per_page ?? query["page[size]"] ?? "50";
  const page = Number(rawPage);
  const perPage = Number(rawPerPage);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(perPage) ||
    perPage < 1 ||
    perPage > 100
  ) {
    return null;
  }

  return { page, perPage, offset: (page - 1) * perPage };
}

// Valida filtros de intervalo e ordenação para campos de data-hora permitidos.
export function parseLocalDateOptions(query, resource) {
  const dateColumns = {
    ...ENTITY_DATE_COLUMNS,
    matches: MATCH_DATE_COLUMNS,
    games: GAME_DATE_COLUMNS,
  }[resource];
  if (!dateColumns) {
    throw new TypeError("Unsupported date-query resource.");
  }

  const dateRanges = {};
  for (const key of Object.keys(query)) {
    if (!key.startsWith("range[")) {
      continue;
    }

    const match = /^range\[([a-z_]+)\]$/.exec(key);
    if (!match || !Object.hasOwn(dateColumns, match[1])) {
      return { error: "Unsupported date range field." };
    }
    const value = query[key];
    if (typeof value !== "string") {
      return { error: "Each date range must contain two ISO 8601 timestamps." };
    }

    const bounds = value.split(",");
    if (
      bounds.length !== 2 ||
      bounds.some((bound) => !isIsoTimestamp(bound)) ||
      Date.parse(bounds[0]) > Date.parse(bounds[1])
    ) {
      return {
        error:
          "Each date range must contain valid, ordered ISO 8601 timestamps.",
      };
    }

    dateRanges[match[1]] = { from: bounds[0], to: bounds[1] };
  }

  let sort;
  if (query.sort !== undefined) {
    if (typeof query.sort !== "string") {
      return { error: "sort must name one supported date-time field." };
    }
    const match = /^(-?)([a-z_]+)$/.exec(query.sort);
    if (!match || !Object.hasOwn(dateColumns, match[2])) {
      return { error: "sort must name one supported date-time field." };
    }
    sort = {
      field: match[2],
      direction: match[1] ? "DESC" : "ASC",
    };
  }

  return { dateRanges, sort };
}

function isIsoTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(
      value,
    )
  ) {
    return false;
  }

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return (
    Number.isFinite(Date.parse(value)) &&
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day
  );
}

function appendDateConditions(conditions, values, dateRanges, columns) {
  for (const [field, { from, to }] of Object.entries(dateRanges)) {
    const column = columns[field];
    conditions.push(
      `julianday(${column}) >= julianday(?) AND julianday(${column}) <= julianday(?)`,
    );
    values.push(from, to);
  }
}

// Lista uma entidade do catálogo com pesquisa e paginação local.
export function listCsgoEntities(
  type,
  {
    page,
    perPage,
    offset,
    search = "",
    upcomingOnly = false,
    parentId,
    dateRanges = {},
    sort,
  },
  db = getDatabase(),
) {
  const config = ENTITY_QUERIES[type];
  if (!config) {
    throw new TypeError("Unsupported Counter-Strike catalog entity.");
  }

  const conditions = [];
  const values = [];
  if (search) {
    conditions.push(config.search);
    values.push(`%${search}%`, `%${search}%`);
  }
  if (upcomingOnly) {
    if (!config.upcomingColumn) {
      throw new TypeError("Upcoming filtering is only available for tournaments.");
    }
    conditions.push(`${config.upcomingColumn} >= ?`);
    values.push(new Date().toISOString());
  }
  if (parentId !== undefined) {
    if (!config.parentColumn || !Number.isInteger(parentId)) {
      throw new TypeError("Unsupported parent filter for this catalog entity.");
    }
    conditions.push(`${config.parentColumn} = ?`);
    values.push(parentId);
  }
  appendDateConditions(
    conditions,
    values,
    dateRanges,
    ENTITY_DATE_COLUMNS[type],
  );

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = sort
    ? `julianday(${ENTITY_DATE_COLUMNS[type][sort.field]}) ${sort.direction}, ${config.idColumn}`
    : config.orderBy;
  const rows = db
    .prepare(
      `SELECT ${config.select}
       FROM ${config.from}
       ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(...values, perPage, offset)
    .map((row) => mapEntityRow(type, row));
  const total = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM ${config.from}
       ${where}`,
    )
    .get(...values).count;

  return {
    data: rows,
    pagination: { page, perPage, total },
  };
}

// Busca uma entidade pelo ID local e inclui seu pai direto quando disponível.
export function getCsgoEntity(type, id, db = getDatabase()) {
  const config = ENTITY_QUERIES[type];
  if (!config) {
    throw new TypeError("Unsupported Counter-Strike catalog entity.");
  }

  const row = db
    .prepare(
      `SELECT ${config.select}
       FROM ${config.from}
       WHERE ${config.idColumn} = ?`,
    )
    .get(id);
  return row ? mapEntityRow(type, row) : row;
}

// Monta partidas e equipes a partir das relações normalizadas do banco.
function groupMatchRows(rows) {
  const matches = new Map();

  for (const row of rows) {
    let match = matches.get(row.matchId);
    if (!match) {
      match = {
        matchId: row.matchId,
        tournamentId: row.tournamentId,
        name: row.name,
        status: row.status,
        beginAt: row.beginAt ?? row.expectedBeginAt,
        expectedBeginAt: row.expectedBeginAt,
        endAt: row.endAt,
        league: row.leagueId
          ? {
              id: row.leagueId,
              name: row.leagueName,
              slug: row.leagueSlug,
              url: row.leagueUrl,
              imageUrl: row.leagueImageUrl,
              videogame: row.videogameId
                ? {
                    id: row.videogameId,
                    name: row.videogameName,
                    slug: row.videogameSlug,
                  }
                : null,
            }
          : null,
        series: row.seriesId
          ? {
              id: row.seriesId,
              name: row.seriesName,
              slug: row.seriesSlug,
              fullName: row.seriesFullName,
              modifiedAt: row.seriesModifiedAt,
              season: row.seriesSeason,
              winnerId: row.seriesWinnerId,
              winnerType: row.seriesWinnerType,
              year: row.seriesYear,
            }
          : null,
        tournament: row.tournamentId
          ? {
              id: row.tournamentId,
              name: row.tournamentName,
              slug: row.tournamentSlug,
              tier: row.tournamentTier,
            }
          : null,
        teams: [],
      };
      matches.set(row.matchId, match);
    }

    if (row.teamId !== null) {
      match.teams.push({
        id: row.teamId,
        name: row.teamName,
        slug: row.teamSlug,
        acronym: row.teamAcronym,
        imageUrl: row.teamImageUrl,
        score: row.teamScore,
      });
    }
  }

  return [...matches.values()];
}

// Lista partidas por estado ou por entidade pai, com paginação por partida.
export function listCsgoMatches(
  {
    state,
    page,
    perPage,
    offset,
    parentType,
    parentId,
    dateRanges = {},
    sort,
    now = new Date(),
  },
  db = getDatabase(),
) {
  const conditions = [];
  const values = [];
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString();
  const nowIso = now.toISOString();

  if (state === "running") {
    conditions.push("m.is_running = 1");
  } else if (state === "upcoming") {
    conditions.push("m.status IN ('not_started', 'upcoming')");
    conditions.push("m.begin_at >= ?");
    values.push(nowIso);
  } else if (state === "past") {
    conditions.push("m.status IN ('finished', 'canceled')");
    conditions.push("COALESCE(m.end_at, m.begin_at) >= ?");
    conditions.push("COALESCE(m.end_at, m.begin_at) <= ?");
    values.push(cutoff, nowIso);
  }

  if (parentType && Number.isInteger(parentId)) {
    const parentColumn = {
      league: "l.id",
      series: "s.id",
      tournament: "t.id",
    }[parentType];
    if (!parentColumn) {
      throw new TypeError("Unsupported match parent entity.");
    }
    conditions.push(`${parentColumn} = ?`);
    values.push(parentId);
  }
  appendDateConditions(conditions, values, dateRanges, MATCH_DATE_COLUMNS);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = sort
    ? `julianday(${MATCH_DATE_COLUMNS[sort.field]}) ${sort.direction}, m.id`
    : "m.begin_at DESC, m.id";
  const idRows = db
    .prepare(
      `SELECT DISTINCT m.id
       FROM matches m
       LEFT JOIN tournaments t ON t.id = m.tournament_id
       LEFT JOIN series s ON s.id = t.series_id
       LEFT JOIN leagues l ON l.id = s.league_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(...values, perPage, offset);
  const total = db
    .prepare(
      `SELECT COUNT(DISTINCT m.id) AS count
       FROM matches m
       LEFT JOIN tournaments t ON t.id = m.tournament_id
       LEFT JOIN series s ON s.id = t.series_id
       LEFT JOIN leagues l ON l.id = s.league_id
       ${where}`,
    )
    .get(...values).count;

  if (idRows.length === 0) {
    return { data: [], pagination: { page, perPage, total } };
  }

  const placeholders = idRows.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `${MATCH_SELECT}
       WHERE m.id IN (${placeholders})
       ORDER BY ${orderBy}, team.id`,
    )
    .all(...idRows.map((row) => row.id));

  return {
    data: groupMatchRows(rows),
    pagination: { page, perPage, total },
  };
}

// Busca uma partida local pelo ID sem chamar endpoints restritos da PandaScore.
export function getCsgoMatch(id, db = getDatabase()) {
  const rows = db
    .prepare(`${MATCH_SELECT} WHERE m.id = ? ORDER BY team.id`)
    .all(id);
  return groupMatchRows(rows)[0];
}

// Lista jogos/mapas de uma partida, incluindo os placares das equipes.
export function listCsgoGames(
  matchId,
  { page, perPage, offset, dateRanges = {}, sort },
  db = getDatabase(),
) {
  const conditions = ["g.match_id = ?"];
  const values = [matchId];
  appendDateConditions(conditions, values, dateRanges, GAME_DATE_COLUMNS);
  const where = conditions.join(" AND ");
  const orderBy = sort
    ? `julianday(${GAME_DATE_COLUMNS[sort.field]}) ${sort.direction}, g.id`
    : "g.position, g.id";
  const ids = db
    .prepare(
      `SELECT id
       FROM games g
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(...values, perPage, offset);
  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM games g WHERE ${where}`)
    .get(...values).count;
  if (ids.length === 0) {
    return { data: [], pagination: { page, perPage, total } };
  }

  const placeholders = ids.map(() => "?").join(", ");
  const games = db
    .prepare(
      `SELECT
         g.id, g.match_id AS matchId, g.position, g.status, g.begin_at AS beginAt,
         g.end_at AS endAt, g.length, g.winner_id AS winnerId,
         g.winner_type AS winnerType, gt.team_id AS teamId, t.name AS teamName,
         gt.score
       FROM games g
       LEFT JOIN game_teams gt ON gt.game_id = g.id
       LEFT JOIN teams t ON t.id = gt.team_id
       WHERE g.id IN (${placeholders})
       ORDER BY ${orderBy}, gt.team_id`,
    )
    .all(...ids.map((row) => row.id));
  const grouped = new Map();

  for (const row of games) {
    let game = grouped.get(row.id);
    if (!game) {
      game = {
        id: row.id,
        matchId: row.matchId,
        position: row.position,
        status: row.status,
        beginAt: row.beginAt,
        endAt: row.endAt,
        length: row.length,
        winnerId: row.winnerId,
        winnerType: row.winnerType,
        teams: [],
      };
      grouped.set(row.id, game);
    }
    if (row.teamId !== null) {
      game.teams.push({
        id: row.teamId,
        name: row.teamName,
        score: row.score,
      });
    }
  }

  return {
    data: [...grouped.values()],
    pagination: { page, perPage, total },
  };
}

// Busca um jogo/mapa local, sem fazer uma chamada direta ao endpoint Historical.
export function getCsgoGame(id, db = getDatabase()) {
  const result = listCsgoGamesForId(id, db);
  return result;
}

// Monta um jogo e seus placares de equipe a partir das tabelas relacionais.
function listCsgoGamesForId(id, db) {
  const rows = db
    .prepare(
      `SELECT
         g.id, g.match_id AS matchId, g.position, g.status, g.begin_at AS beginAt,
         g.end_at AS endAt, g.length, g.winner_id AS winnerId,
         g.winner_type AS winnerType, gt.team_id AS teamId, t.name AS teamName,
         gt.score
       FROM games g
       LEFT JOIN game_teams gt ON gt.game_id = g.id
       LEFT JOIN teams t ON t.id = gt.team_id
       WHERE g.id = ?
       ORDER BY gt.team_id`,
    )
    .all(id);

  if (rows.length === 0) {
    return undefined;
  }

  const game = {
    id: rows[0].id,
    matchId: rows[0].matchId,
    position: rows[0].position,
    status: rows[0].status,
    beginAt: rows[0].beginAt,
    endAt: rows[0].endAt,
    length: rows[0].length,
    winnerId: rows[0].winnerId,
    winnerType: rows[0].winnerType,
    teams: [],
  };
  for (const row of rows) {
    if (row.teamId !== null) {
      game.teams.push({
        id: row.teamId,
        name: row.teamName,
        score: row.score,
      });
    }
  }
  return game;
}
