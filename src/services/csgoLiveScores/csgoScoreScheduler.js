// ------------------------------------------------------------------------------------------
// Executa imediatamente uma sincronização de placares de Counter-Strike e agenda a
// próxima após o intervalo configurado, sem permitir execuções sobrepostas. Registra
// erros sem imprimir cabeçalhos ou token, continua tentando após falhas temporárias e
// oferece uma função para cancelar o temporizador ao encerrar o servidor.
// ------------------------------------------------------------------------------------------




import { pandascore } from "../../integrations/pandascore/client.js";
import { getDatabase } from "../../db/database.js";
import { syncCsgoLiveScores } from "./csgoLiveScoreSync.js";

const REFRESH_INTERVAL_MS = 30_000;
let stopActiveScheduler;

// Inicia uma sincronização imediata e agenda as próximas sem sobreposição.
export function startCsgoScoreScheduler({
  client = pandascore,
  db = getDatabase(),
  intervalMs = REFRESH_INTERVAL_MS,
  logger = console,
} = {}) {
  if (stopActiveScheduler) {
    return stopActiveScheduler;
  }

  let stopped = false;
  let timer;

  // Cancela o temporizador para impedir novas sincronizações.
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stopActiveScheduler = undefined;
  };

  // Executa a sincronização, registra falhas e agenda o próximo ciclo.
  async function refreshAndSchedule() {
    try {
      const snapshot = await syncCsgoLiveScores({ client, db });
      logger.info(
        `Updated ${snapshot.matches.length} running Counter-Strike matches.`,
      );
    } catch (error) {
      logger.error(
        "Counter-Strike score refresh failed:",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      if (!stopped) {
        timer = setTimeout(refreshAndSchedule, intervalMs);
      }
    }
  }

  stopActiveScheduler = stop;
  void refreshAndSchedule();

  return stop;
}
