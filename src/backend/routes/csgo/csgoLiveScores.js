// ------------------------------------------------------------------------------------------
// Define o endpoint GET /api/csgo/live-scores, que devolve os placares mantidos no cache
// local sem consultar a PandaScore. A resposta inclui o horário da última sincronização e
// um indicador de dados desatualizados, calculado para sinalizar cache ausente ou sem
// atualização recente.
// ------------------------------------------------------------------------------------------




import { Router } from "express";
import { getCsgoScoreCache } from "../../services/csgo/csgoScoreCache.js";
import { parseLocalDateOptions } from "../../services/csgo/csgoCatalogQueries.js";

const router = Router();
const STALE_AFTER_MS = 90_000;
const LIVE_SCORE_DATE_FIELDS = {
  begin_at: "beginAt",
  expected_begin_at: "expectedBeginAt",
  end_at: "endAt",
};

// Filtra e ordena o cache por data sem alterar o snapshot compartilhado.
function getLiveScoreMatches(query, matches) {
  const dateOptions = parseLocalDateOptions(query, "matches");
  if (dateOptions.error) {
    return dateOptions;
  }

  let filteredMatches = matches.filter((match) =>
    Object.entries(dateOptions.dateRanges).every(([field, range]) => {
      const timestamp = Date.parse(match[LIVE_SCORE_DATE_FIELDS[field]] ?? "");
      return (
        Number.isFinite(timestamp) &&
        timestamp >= Date.parse(range.from) &&
        timestamp <= Date.parse(range.to)
      );
    }),
  );

  if (dateOptions.sort) {
    const { field, direction } = dateOptions.sort;
    const property = LIVE_SCORE_DATE_FIELDS[field];
    const multiplier = direction === "ASC" ? 1 : -1;
    filteredMatches = filteredMatches.sort((first, second) => {
      const firstDate = Date.parse(first[property] ?? "");
      const secondDate = Date.parse(second[property] ?? "");
      if (!Number.isFinite(firstDate) || !Number.isFinite(secondDate)) {
        if (!Number.isFinite(firstDate) && !Number.isFinite(secondDate)) {
          return first.matchId - second.matchId;
        }
        return (Number.isFinite(firstDate) ? 1 : -1) * multiplier;
      }
      return (
        (firstDate - secondDate) * multiplier ||
        first.matchId - second.matchId
      );
    });
  }

  return { matches: filteredMatches };
}

// Responde com o cache local, aplicando filtros de data opcionais.
router.get("/", (request, response) => {
  const snapshot = getCsgoScoreCache();
  const result = getLiveScoreMatches(request.query, snapshot.matches);
  if (result.error) {
    response.status(400).json({ error: result.error });
    return;
  }

  const updatedAtMs = snapshot.updatedAt
    ? Date.parse(snapshot.updatedAt)
    : Number.NaN;

  response.json({
    game: "counter-strike",
    updatedAt: snapshot.updatedAt,
    isStale: // true indica cache ausente ou sem atualização recente; false indica dados recentes.
      !Number.isFinite(updatedAtMs) ||
      Date.now() - updatedAtMs > STALE_AFTER_MS,
    matches: result.matches,
  });
});

export default router;
