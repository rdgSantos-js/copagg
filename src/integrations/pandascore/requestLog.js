// ------------------------------------------------------------------------------------------
// Registra metadados de cada chamada PandaScore no SQLite sem gravar credenciais
// nem o conteúdo da requisição ou resposta.
// ------------------------------------------------------------------------------------------




import { getDatabase } from "../../db/database.js";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const INSERT_REQUEST_LOG = `
  INSERT INTO api_request_logs
    (requested_at, completed_at, provider, method, endpoint, page,
     http_status, duration_ms, outcome, error_code)
  VALUES
    (@requestedAt, @completedAt, 'pandascore', @method, @endpoint, @page,
     @httpStatus, @durationMs, @outcome, @errorCode)
`;

// Extrai um caminho sem host nem parâmetros que possam conter credenciais.
function getEndpointPath(config) {
  const rawUrl = String(config?.url ?? "");
  const withoutHost = rawUrl.replace(/^https?:\/\/[^/]+/i, "");
  return (withoutHost.split(/[?#]/, 1)[0] || "/").slice(0, 200);
}

// Persiste uma tentativa HTTP e remove registros fora do prazo de retenção.
function persistRequestLog(db, config, result, now, logger) {
  const completedAtMs = now();
  const startedAtMs = Number.isFinite(config?.metadata?.pandascoreStartedAt)
    ? config.metadata.pandascoreStartedAt
    : completedAtMs;
  const startedAt = new Date(startedAtMs);
  const completedAt = new Date(completedAtMs);
  const errorCode =
    typeof result.errorCode === "string" &&
    /^[A-Za-z0-9_-]{1,100}$/.test(result.errorCode)
      ? result.errorCode
      : null;

  try {
    db.transaction(() => {
      db.prepare(INSERT_REQUEST_LOG).run({
        requestedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        method: String(config?.method ?? "unknown")
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, 10),
        endpoint: getEndpointPath(config),
        page: Number.isInteger(config?.params?.page)
          ? config.params.page
          : null,
        httpStatus: Number.isInteger(result.httpStatus)
          ? result.httpStatus
          : null,
        durationMs: Math.max(0, completedAtMs - startedAtMs),
        outcome: result.outcome,
        errorCode,
      });

      const cutoff = new Date(completedAtMs - RETENTION_MS).toISOString();
      db.prepare("DELETE FROM api_request_logs WHERE requested_at < ?").run(
        cutoff,
      );
    })();
  } catch (error) {
    const safeCode =
      typeof error?.code === "string" &&
      /^[A-Za-z0-9_-]{1,100}$/.test(error.code)
        ? error.code
        : "unknown";
    logger.error("Could not persist PandaScore request log:", safeCode);
  }
}

// Adiciona interceptors para registrar o resultado de cada chamada Axios.
export function attachPandaScoreRequestLogging(
  client,
  {
    db = getDatabase(),
    now = Date.now,
    logger = console,
  } = {},
) {
  client.interceptors.request.use((config) => {
    config.metadata = {
      ...config.metadata,
      pandascoreStartedAt: now(),
    };
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      persistRequestLog(
        db,
        response.config,
        {
          httpStatus: response.status,
          outcome: "success",
        },
        now,
        logger,
      );
      return response;
    },
    (error) => {
      if (error.config) {
        persistRequestLog(
          db,
          error.config,
          {
            httpStatus: error.response?.status,
            errorCode: error.code,
            outcome: "error",
          },
          now,
          logger,
        );
      }

      return Promise.reject(error);
    },
  );

  return client;
}

// Remove registros de requisições com mais de 30 dias durante a inicialização.
export function purgeOldPandaScoreRequestLogs(
  db = getDatabase(),
  now = Date.now,
) {
  const cutoff = new Date(now() - RETENTION_MS).toISOString();
  return db
    .prepare("DELETE FROM api_request_logs WHERE requested_at < ?")
    .run(cutoff).changes;
}
