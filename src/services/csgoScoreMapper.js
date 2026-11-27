// ------------------------------------------------------------------------------------------
// Converte o objeto bruto de uma partida da PandaScore em um formato estável para a API
// local. Associa o placar de cada equipe pelo identificador, preserva valores válidos
// como zero, trata equipes ou resultados ausentes e padroniza os campos de partida usados
// pelo banco, cache e resposta HTTP.
// ------------------------------------------------------------------------------------------

// Extrai equipes e placares do objeto da PandaScore para o formato interno da aplicação.
export function mapCsgoMatch(match) {
  if (!match || !Number.isInteger(match.id)) {
    throw new TypeError("PandaScore returned a match without a valid id.");
  }

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
        score: result?.score ?? null,
      };
    });

  return {
    matchId: match.id,
    name: match.name ?? null,
    status: match.status ?? "running",
    beginAt: match.begin_at ?? match.expected_begin_at ?? null,
    teams,
  };
}
