// ------------------------------------------------------------------------------------------
// Normaliza partidas e entidades da PandaScore para persistência relacional e respostas locais.
// ------------------------------------------------------------------------------------------




// Converte uma entidade de competição quando a resposta inclui seu identificador.
function mapCompetitionEntity(entity, extra = {}) {
  if (!entity || !Number.isInteger(entity.id)) {
    return null;
  }

  return {
    id: entity.id,
    name: entity.name ?? null,
    slug: entity.slug ?? null,
    beginAt: entity.begin_at ?? null,
    endAt: entity.end_at ?? null,
    ...extra,
  };
}

// Converte um jogo/mapa e seus resultados para o modelo interno.
function mapGame(game) {
  if (!game || !Number.isInteger(game.id)) {
    throw new TypeError("PandaScore returned a game without a valid id.");
  }

  return {
    id: game.id,
    position: game.position ?? null,
    status: game.status ?? null,
    beginAt: game.begin_at ?? null,
    endAt: game.end_at ?? null,
    length: game.length ?? null,
    winnerId: game.winner_id ?? null,
    winnerType: game.winner_type ?? null,
    results: Array.isArray(game.results)
      ? game.results
          .filter((result) => Number.isInteger(result?.team_id))
          .map((result) => ({
            teamId: result.team_id,
            score: result.score ?? null,
          }))
      : [],
  };
}

function mapTeam(team) {
  if (!team || !Number.isInteger(team.id)) {
    return null;
  }

  return {
    id: team.id,
    name: team.name ?? "Unknown team",
    slug: team.slug ?? null,
    acronym: team.acronym ?? null,
    imageUrl: team.image_url ?? null,
    darkModeImageUrl: team.dark_mode_image_url ?? null,
    location: team.location ?? null,
    modifiedAt: team.modified_at ?? null,
  };
}

function mapNullableBoolean(value) {
  return value == null ? null : Number(value);
}

// Normaliza uma liga recebida do endpoint de leagues.
export function mapCsgoLeague(league) {
  const mappedLeague = mapCompetitionEntity(league);
  if (!mappedLeague) {
    return null;
  }

  const videogame = league.videogame;
  const videogameSlug =
    typeof videogame?.slug === "string" && videogame.slug
      ? videogame.slug
      : "cs-go";

  return {
    ...mappedLeague,
    url: league.url ?? null,
    imageUrl: league.image_url ?? null,
    videogame: {
      name:
        videogame?.name ??
        (videogameSlug === "cs-go" ? "Counter-Strike" : videogameSlug),
      slug: videogameSlug,
    },
  };
}

// Valida e normaliza um videogame recebido do catálogo público da PandaScore.
export function mapPandaScoreVideogame(videogame) {
  if (
    !videogame ||
    !Number.isInteger(videogame.id) ||
    typeof videogame.name !== "string" ||
    !videogame.name ||
    typeof videogame.slug !== "string" ||
    !videogame.slug
  ) {
    return null;
  }

  return {
    pandascoreId: videogame.id,
    name: videogame.name,
    slug: videogame.slug,
  };
}

// Normaliza uma série e mantém sua referência à liga correspondente.
export function mapCsgoSeries(series, fallback = {}) {
  const entity =
    series ??
    (Number.isInteger(fallback.id) ? { id: fallback.id } : null);
  if (!entity) {
    return null;
  }

  const league = mapCsgoLeague(entity.league);
  return mapCompetitionEntity(entity, {
    leagueId: entity.league_id ?? league?.id ?? fallback.leagueId ?? null,
    fullName: entity.full_name ?? null,
    modifiedAt: entity.modified_at ?? null,
    season: entity.season ?? null,
    winnerId: entity.winner_id ?? null,
    winnerType: entity.winner_type ?? null,
    year: entity.year ?? null,
  });
}

// Normaliza um torneio e mantém sua referência à série correspondente.
export function mapCsgoTournament(tournament, fallback = {}) {
  const entity =
    tournament ??
    (Number.isInteger(fallback.id) ? { id: fallback.id } : null);
  if (!entity) {
    return null;
  }

  const series = mapCsgoSeries(entity.serie);
  return mapCompetitionEntity(entity, {
    seriesId:
      entity.serie_id ??
      entity.series_id ??
      series?.id ??
      fallback.seriesId ??
      null,
    leagueId:
      entity.league_id ??
      entity.league?.id ??
      fallback.leagueId ??
      null,
    tier: entity.tier ?? null,
    type: entity.type ?? null,
    country: entity.country ?? null,
    detailedStats:
      entity.detailed_stats == null ? null : Number(entity.detailed_stats),
    winnerId: entity.winner_id ?? null,
    winnerType: entity.winner_type ?? null,
    region: entity.region ?? null,
    modifiedAt: entity.modified_at ?? null,
    prizepool: entity.prizepool ?? null,
    hasBracket:
      entity.has_bracket == null ? null : Number(entity.has_bracket),
    liveSupported:
      entity.live_supported == null ? null : Number(entity.live_supported),
  });
}

// Mapeia uma partida, seus participantes e entidades da hierarquia competitiva.
export function mapCsgoMatch(match) {
  if (!match || !Number.isInteger(match.id)) {
    throw new TypeError("PandaScore returned a match without a valid id.");
  }

  const rawTournament = match.tournament;
  const rawSeries = match.serie ?? rawTournament?.serie;
  const rawLeague =
    match.league ?? rawSeries?.league ?? rawTournament?.league;
  const rawLeagueId =
    rawLeague?.id ??
    rawSeries?.league_id ??
    rawTournament?.league_id ??
    match.league_id;
  const league = mapCsgoLeague(
    rawLeague ??
      (Number.isInteger(rawLeagueId) ? { id: rawLeagueId } : null),
  );
  const rawSeriesId =
    rawSeries?.id ??
    rawTournament?.serie_id ??
    rawTournament?.series_id ??
    match.serie_id ??
    match.series_id;
  const series = mapCsgoSeries(rawSeries, {
    id: rawSeriesId,
    leagueId: league?.id,
  });
  const rawTournamentId = rawTournament?.id ?? match.tournament_id;
  const tournament = mapCsgoTournament(rawTournament, {
    id: rawTournamentId,
    seriesId: series?.id,
  });
  const rawVideogame = match.videogame;
  const videogame = rawVideogame
    ? {
        id: rawVideogame.id ?? null,
        name: rawVideogame.name ?? null,
        slug: rawVideogame.slug ?? null,
      }
    : league?.videogame
      ? { id: null, ...league.videogame }
      : null;
  const videogameTitle = match.videogame_title
    ? {
        id: match.videogame_title.id ?? null,
        name: match.videogame_title.name ?? null,
        slug: match.videogame_title.slug ?? null,
        videogameId: match.videogame_title.videogame_id ?? null,
      }
    : null;
  const videogameVersion = match.videogame_version
    ? {
        current: mapNullableBoolean(match.videogame_version.current),
        name: match.videogame_version.name ?? null,
      }
    : null;
  const results = Array.isArray(match.results) ? match.results : [];
  const opponents = Array.isArray(match.opponents) ? match.opponents : [];
  const teams = opponents
    .map((entry) => {
      const opponent = mapTeam(entry?.opponent);
      if (!opponent) {
        return null;
      }
      const result = results.find(
        (resultEntry) => resultEntry.team_id === opponent.id,
      );

      return {
        ...opponent,
        type: entry.type ?? null,
        score: result?.score ?? null,
      };
    })
    .filter(Boolean);
  const winner = mapTeam(match.winner);
  const streamsList = Array.isArray(match.streams_list)
    ? match.streams_list.map((stream, position) => ({
        position,
        embedUrl: stream?.embed_url ?? null,
        language: stream?.language ?? null,
        main: mapNullableBoolean(stream?.main),
        official: mapNullableBoolean(stream?.official),
        rawUrl: stream?.raw_url ?? null,
      }))
    : null;

  return {
    matchId: match.id,
    leagueId: match.league_id ?? league?.id ?? null,
    seriesId: match.serie_id ?? match.series_id ?? series?.id ?? null,
    tournamentId: tournament?.id ?? null,
    videogame,
    slug: match.slug ?? null,
    name: match.name ?? null,
    status: match.status ?? "running",
    beginAt: match.begin_at ?? match.expected_begin_at ?? null,
    expectedBeginAt: match.expected_begin_at ?? null,
    endAt: match.end_at ?? null,
    detailedStats: mapNullableBoolean(match.detailed_stats),
    draw: mapNullableBoolean(match.draw),
    forfeit: mapNullableBoolean(match.forfeit),
    gameAdvantage: match.game_advantage ?? null,
    matchType: match.match_type ?? null,
    modifiedAt: match.modified_at ?? null,
    numberOfGames: match.number_of_games ?? null,
    originalScheduledAt: match.original_scheduled_at ?? null,
    rescheduled: mapNullableBoolean(match.rescheduled),
    scheduledAt: match.scheduled_at ?? null,
    videogameTitle,
    videogameVersion,
    winner,
    winnerId: match.winner_id ?? winner?.id ?? null,
    winnerType: match.winner_type ?? null,
    streamsList,
    league,
    series,
    tournament,
    teams,
    opponents: teams.map(({ score, ...opponent }) => ({
      type: opponent.type,
      opponent: Object.fromEntries(
        Object.entries(opponent).filter(([key]) => key !== "type"),
      ),
    })),
    results: teams
      .filter((team) => team.score !== null)
      .map((team) => ({ teamId: team.id, score: team.score })),
    games: Array.isArray(match.games) ? match.games.map(mapGame) : null,
  };
}
