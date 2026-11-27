// ------------------------------------------------------------------------------------------
// Classifica falhas da API PandaScore e grava metadados sanitizados no SQLite.
// Não salva tokens, cabeçalhos nem respostas brutas; remove logs com mais de 30 dias.
// Se o registro falhar, reporta o problema sem ocultar o erro original.
// ------------------------------------------------------------------------------------------




import { isAxiosError } from "axios";
import { getDatabase } from "../../db/database.js";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 500;
// Mantém o INSERT parametrizado para registrar erros sem salvar cabeçalhos ou respostas brutas.
const ERROR_LOG_INSERT = `
  INSERT INTO api_error_logs
    (occurred_at, provider, method, endpoint, page, category, http_status,
     error_code, message, retryable)
  VALUES
    (@occurredAt, 'pandascore', 'GET', @endpoint, @page, @category, @httpStatus,
     @errorCode, @message, @retryable)
`;

// Remove dados de controle e credenciais antes de persistir uma mensagem de erro.
function sanitizeText(value, maxLength = MAX_MESSAGE_LENGTH) {
  let text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/([?&]token=)[^&\s]+/gi, "$1[REDACTED]");

  const token = process.env.PANDASCORE_TOKEN?.trim();
  if (token) {
    text = text.split(token).join("[REDACTED]");
  }

  return text.slice(0, maxLength) || "Unknown error";
}

// Classifica a falha e indica se o próximo ciclo pode tentar novamente.
function classifyError(error, categoryOverride) {
  const httpStatus = Number.isInteger(error?.response?.status)
    ? error.response.status
    : null;
  const errorCode =
    typeof error?.code === "string"
      ? sanitizeText(error.code, 100)
      : null;

  if (categoryOverride) {
    return {
      category: categoryOverride,
      httpStatus,
      errorCode,
      retryable: false,
    };
  }

  if (httpStatus !== null) {
    return {
      category: "http",
      httpStatus,
      errorCode,
      retryable:
        httpStatus === 408 || httpStatus === 425 || httpStatus === 429 || httpStatus >= 500,
    };
  }

  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
    return {
      category: "timeout",
      httpStatus: null,
      errorCode,
      retryable: true,
    };
  }

  if (isAxiosError(error)) {
    return {
      category: "network",
      httpStatus: null,
      errorCode,
      retryable: true,
    };
  }

  return {
    category: "integration",
    httpStatus: null,
    errorCode,
    retryable: false,
  };
}

// Apaga do SQLite os registros de erro que ultrapassaram o prazo de retenção.
export function purgeOldPandaScoreErrorLogs(
  db = getDatabase(),
  now = () => new Date(),
) {
  const cutoff = new Date(now().getTime() - RETENTION_MS).toISOString();
  return db
    .prepare("DELETE FROM api_error_logs WHERE occurred_at < ?")
    .run(cutoff).changes;
}

// Salva uma falha sanitizada e mantém a exceção original caso o registro também falhe.
export function recordPandaScoreError(
  db,
  error,
  {
    endpoint,
    page = null,
    category,
    now = () => new Date(),
    logger = console,
  } = {},
) {
  const occurredAtDate = now();
  const occurredAt = occurredAtDate.toISOString();
  const details = classifyError(error, category);
  const message = sanitizeText(
    error instanceof Error ? error.message : error,
  );
  const endpointPath = sanitizeText(endpoint, 200).split("?")[0];
  const cutoff = new Date(occurredAtDate.getTime() - RETENTION_MS).toISOString();

  try {
    db.transaction(() => {
      db.prepare(ERROR_LOG_INSERT).run({
        occurredAt,
        endpoint: endpointPath,
        page: Number.isInteger(page) ? page : null,
        category: details.category,
        httpStatus: details.httpStatus,
        errorCode: details.errorCode,
        message,
        retryable: details.retryable ? 1 : 0,
      });
      db.prepare("DELETE FROM api_error_logs WHERE occurred_at < ?").run(cutoff);
    })();

    return true;
  } catch (loggingError) {
    logger.error(
      "Could not persist PandaScore error log:",
      sanitizeText(
        loggingError instanceof Error ? loggingError.message : loggingError,
      ),
    );
    return false;
  }
}
