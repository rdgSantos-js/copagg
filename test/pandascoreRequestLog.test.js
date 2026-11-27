// ------------------------------------------------------------------------------------------
// Verifica o registro individual de chamadas PandaScore bem-sucedidas e com erro,
// usando um adapter Axios simulado e SQLite em memória.
// ------------------------------------------------------------------------------------------




import assert from "node:assert/strict";
import axios, { AxiosError } from "axios";
import test from "node:test";
import { createDatabase } from "../src/db/database.js";
import { attachPandaScoreRequestLogging } from "../src/integrations/pandascore/requestLog.js";

// Confirma que cada tentativa registra status, página e duração sem guardar segredos.
test("records successful and failed PandaScore requests individually", async (t) => {
  const db = createDatabase(":memory:");
  t.after(() => db.close());

  const times = [1_000, 1_045, 2_000, 2_075];
  const client = axios.create({
    baseURL: "https://api.pandascore.co",
    adapter: async (config) => {
      if (config.url.includes("failure")) {
        throw new AxiosError(
          "Request failed",
          "ERR_BAD_REQUEST",
          config,
          undefined,
          {
            status: 429,
            statusText: "Too Many Requests",
            headers: {},
            config,
            data: {},
          },
        );
      }

      return {
        data: [],
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    },
  });

  attachPandaScoreRequestLogging(client, {
    db,
    now: () => times.shift(),
    logger: {
      error() {
        assert.fail("Request logs should be persisted successfully.");
      },
    },
  });

  await client.get("/csgo/matches/running?token=never-store", {
    params: { page: 2 },
    headers: { Authorization: "Bearer never-store" },
  });
  await assert.rejects(
    client.get("/csgo/matches/failure", { params: { page: 3 } }),
    (error) => error.response.status === 429,
  );

  const logs = db
    .prepare("SELECT * FROM api_request_logs ORDER BY id")
    .all();

  assert.equal(logs.length, 2);
  assert.deepEqual(
    logs.map((log) => ({
      endpoint: log.endpoint,
      page: log.page,
      status: log.http_status,
      duration: log.duration_ms,
      outcome: log.outcome,
    })),
    [
      {
        endpoint: "/csgo/matches/running",
        page: 2,
        status: 200,
        duration: 45,
        outcome: "success",
      },
      {
        endpoint: "/csgo/matches/failure",
        page: 3,
        status: 429,
        duration: 75,
        outcome: "error",
      },
    ],
  );
  assert.doesNotMatch(JSON.stringify(logs), /never-store/);
});
