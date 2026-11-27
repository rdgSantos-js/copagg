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

// Normaliza uma liga recebida do endpoint de leagues.
export function mapCsgoLeague(league) {
  return mapCompetitionEntity(league);
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
    tier: entity.tier ?? null,
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
  const results = Array.isArray(match.results) ? match.results : [];
  const opponents = Array.isArray(match.opponents) ? match.opponents : [];
  const teams = opponents
    .map((entry) => entry?.opponent)
    .filter((opponent) => opponent && Number.isInteger(opponent.id))
    .map((opponent) => {
      const result = results.find(
        (entry) => entry.team_id === opponent.id,
      );

      return {
        id: opponent.id,
        name: opponent.name ?? "Unknown team",
        slug: opponent.slug ?? null,
        acronym: opponent.acronym ?? null,
        imageUrl: opponent.image_url ?? null,
        score: result?.score ?? null,
      };
    });

  return {
    matchId: match.id,
    tournamentId: tournament?.id ?? null,
    name: match.name ?? null,
    status: match.status ?? "running",
    beginAt: match.begin_at ?? match.expected_begin_at ?? null,
    expectedBeginAt: match.expected_begin_at ?? null,
    endAt: match.end_at ?? null,
    league,
    series,
    tournament,
    teams,
    games: Array.isArray(match.games) ? match.games.map(mapGame) : null,
  };
}
