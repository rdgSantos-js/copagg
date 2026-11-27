// ------------------------------------------------------------------------------------------
// Define o endpoint GET /api/csgo/live-scores, que devolve os placares mantidos no cache
// local sem consultar a PandaScore. A resposta inclui o horário da última sincronização e
// um indicador de dados desatualizados, calculado para sinalizar cache ausente ou sem
// atualização recente.
// ------------------------------------------------------------------------------------------




import { Router } from "express";
import { getCsgoScoreCache } from "../services/csgoScoreCache.js";

const router = Router();
const STALE_AFTER_MS = 90_000;

// Responde com o cache local e informa quando os placares estão desatualizados.
router.get("/", (request, response) => {
  const snapshot = getCsgoScoreCache();
  const updatedAtMs = snapshot.updatedAt
    ? Date.parse(snapshot.updatedAt)
    : Number.NaN;

  response.json({
    game: "counter-strike",
    updatedAt: snapshot.updatedAt,
    isStale: // true indica cache ausente ou sem atualização recente; false indica dados recentes.
      !Number.isFinite(updatedAtMs) ||
      Date.now() - updatedAtMs > STALE_AFTER_MS,
    matches: snapshot.matches,
  });
});

export default router;
