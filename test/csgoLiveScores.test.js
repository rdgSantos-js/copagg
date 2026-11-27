// ------------------------------------------------------------------------------------------
// Valida o mapeamento de equipes e placares, inclusive pontuação zero, a paginação do
// endpoint CS2, a gravação no SQLite e o formato da resposta HTTP servida pelo cache.
// Também verifica que uma falha simulada da PandaScore não apaga nem substitui o último
// snapshot válido, sem usar token ou rede real.
// ------------------------------------------------------------------------------------------




import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { AxiosError } from "axios";
import app from "../src/app.js";
import { createDatabase } from "../src/db/database.js";
import { getCsgoScoreCache } from "../src/services/csgoScoreCache.js";
import { mapCsgoMatch } from "../src/services/csgoScoreMapper.js";
import {
  purgeOldPandaScoreErrorLogs,
  recordPandaScoreError,
} from "../src/integrations/pandascore/errorLog.js";
import { syncCsgoLiveScores } from "../src/services/csgoLiveScores/csgoLiveScoreSync.js";

// Representa uma partida ao vivo com placares conhecidos para os testes.
const sampleMatch = {
  id: 123,
  name: "Team A vs Team B",
  status: "running",
  begin_at: "2026-11-26T16:00:00Z",
  opponents: [
    { opponent: { id: 1, name: "Team A" } },
    { opponent: { id: 2, name: "Team B" } },
  ],
  results: [
    { team_id: 1, score: 13 },
    { team_id: 2, score: 0 },
  ],
};

// Confirma que o mapeamento preserva equipes e placares, inclusive o valor zero.
test("maps team scores, including a zero score", () => {
  assert.deepEqual(mapCsgoMatch(sampleMatch), {
    matchId: 123,
    name: "Team A vs Team B",
    status: "running",
    beginAt: "2026-11-26T16:00:00Z",
    teams: [
      { id: 1, name: "Team A", score: 13 },
      { id: 2, name: "Team B", score: 0 },
    ],
  });
});

// Confirma que uma página cheia faz o sincronizador consultar a página seguinte.
test("fetches subsequent pages when the previous page is full", async (t) => {
  const db = createDatabase(":memory:");
  t.after(() => db.close());

  const calls = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    ...sampleMatch,
    id: 1_000 + index,
  }));
  const client = {
    async get(path, { params }) {
      calls.push({ path, page: params.page });
      return { data: params.page === 1 ? firstPage : [] };
    },
  };

  const snapshot = await syncCsgoLiveScores({ client, db });

  assert.deepEqual(calls, [
    { path: "/csgo/matches/running", page: 1 },
    { path: "/csgo/matches/running", page: 2 },
  ]);
  assert.equal(snapshot.matches.length, 100);
});

// Verifica persistência, resposta pelo cache e retenção dos dados diante de falhas.
test("persists scores, serves the cache, and preserves it on sync failure", async (t) => {
  const db = createDatabase(":memory:");
  t.after(() => db.close());

  const calls = [];
  const client = {
    async get(path, options) {
      calls.push({ path, options });
      return { data: [sampleMatch] };
    },
  };

  const updatedAt = new Date();
  const snapshot = await syncCsgoLiveScores({
    client,
    db,
    now: () => updatedAt,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/csgo/matches/running");
  assert.deepEqual(calls[0].options.params, { page: 1, per_page: 100 });
  assert.equal(snapshot.updatedAt, updatedAt.toISOString());
  assert.equal(snapshot.matches[0].teams[1].score, 0);

  const server = app.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/csgo/live-scores`,
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.game, "counter-strike");
    assert.equal(body.isStale, false);
    assert.equal(body.updatedAt, updatedAt.toISOString());
    assert.equal(body.matches[0].matchId, 123);
    assert.equal(calls.length, 1);
  } finally {
    server.close();
    await once(server, "close");
  }

  await assert.rejects(
    syncCsgoLiveScores({
      client: {
        async get() {
          throw new Error("upstream unavailable");
        },
      },
      db,
    }),
    /upstream unavailable/,
  );

  assert.deepEqual(getCsgoScoreCache(), snapshot);
});

// Confirma a sanitização dos erros HTTP e a remoção de registros após 30 dias.
test("records sanitized PandaScore errors and removes logs older than 30 days", async (t) => {
  const db = createDatabase(":memory:");
  t.after(() => db.close());

  const upstreamError = new AxiosError(
    "Request failed with status code 429. Bearer fake-pandascore-secret",
    "ERR_BAD_REQUEST",
    { headers: { Authorization: "Bearer fake-pandascore-secret" } },
    undefined,
    {
      status: 429,
      data: { message: "Too many requests" },
      headers: {},
      config: {},
    },
  );

  await assert.rejects(
    syncCsgoLiveScores({
      client: {
        async get() {
          throw upstreamError;
        },
      },
      db,
    }),
    (error) => error === upstreamError,
  );

  const log = db
    .prepare("SELECT * FROM api_error_logs ORDER BY id DESC")
    .get();

  assert.equal(log.provider, "pandascore");
  assert.equal(log.endpoint, "/csgo/matches/running");
  assert.equal(log.page, 1);
  assert.equal(log.category, "http");
  assert.equal(log.http_status, 429);
  assert.equal(log.error_code, "ERR_BAD_REQUEST");
  assert.equal(log.retryable, 1);
  assert.match(log.message, /Bearer \[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(log), /fake-pandascore-secret/);

  const future = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
  assert.equal(
    purgeOldPandaScoreErrorLogs(db, () => future),
    1,
  );
});

// Garante que uma resposta inválida seja registrada e rejeitada pelo sincronizador.
test("records an invalid PandaScore response shape", async (t) => {
  const db = createDatabase(":memory:");
  t.after(() => db.close());

  await assert.rejects(
    syncCsgoLiveScores({
      client: {
        async get() {
          return { data: { unexpected: true } };
        },
      },
      db,
    }),
    /invalid running-matches response/,
  );

  const log = db
    .prepare("SELECT category FROM api_error_logs ORDER BY id DESC")
    .get();
  assert.equal(log.category, "invalid_response");
});

// Garante que uma falha ao gravar o log não esconda o erro original da API.
test("reports error-log database failures without replacing the original error", () => {
  const messages = [];
  const stored = recordPandaScoreError(
    {
      transaction() {
        throw new Error("database unavailable");
      },
    },
    new Error("PandaScore request failed"),
    {
      endpoint: "/csgo/matches/running",
      logger: {
        error(...args) {
          messages.push(args);
        },
      },
    },
  );

  assert.equal(stored, false);
  assert.equal(messages.length, 1);
  assert.match(messages[0][0], /Could not persist PandaScore error log/);
  assert.match(messages[0][1], /database unavailable/);
});
