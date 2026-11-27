// ------------------------------------------------------------------------------------------
// É o ponto de entrada executável do serviço: carrega o ambiente, valida a porta,
// inicializa o banco SQLite, recompõe o cache persistente e inicia o servidor Express com
// o sincronizador de Counter-Strike. Também trata sinais de encerramento para parar o
// agendamento e fechar conexões de forma controlada.
// ------------------------------------------------------------------------------------------




import "dotenv/config";
import app from "./app.js";
import { getDatabase } from "./db/database.js";
import { hydrateCsgoScoreCache } from "./services/csgoScoreCache.js";
import { purgeOldPandaScoreErrorLogs } from "./integrations/pandascore/errorLog.js";
import { purgeOldPandaScoreRequestLogs } from "./integrations/pandascore/requestLog.js";
import { startCsgoScoreScheduler } from "./services/csgoLiveScores/csgoScoreScheduler.js";

// Lê e valida a porta HTTP configurada para o servidor.
const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

// Abre o banco, remove logs expirados e carrega o cache persistido.
const db = getDatabase();
purgeOldPandaScoreErrorLogs(db);
purgeOldPandaScoreRequestLogs(db);
hydrateCsgoScoreCache(db);

// Inicia a API HTTP e o sincronizador agendado de placares.
const server = app.listen(port, () => {
  console.info(`Live-score API listening on port ${port}.`);
});

const stopScheduler = startCsgoScoreScheduler({ db });

// Para o agendador e fecha o servidor e o banco durante o encerramento.
function shutdown() {
  stopScheduler();
  server.close((error) => {
    if (error) {
      console.error("Could not close the HTTP server:", error.message);
      process.exitCode = 1;
    }

    db.close();
  });
}

// Trata sinais do sistema para encerrar o serviço de forma controlada.
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
