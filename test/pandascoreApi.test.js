// ------------------------------------------------------------------------------------------
// Testa opcionalmente a integração autenticada com a PandaScore usando uma única
// consulta somente de leitura; por padrão, não faz chamadas externas.
// ------------------------------------------------------------------------------------------




import assert from "node:assert/strict";
import "dotenv/config";
import test from "node:test";
import { PANDASCORE_ENDPOINTS } from "../src/backend/integrations/pandascore/endpoints.js";
import { mapCsgoMatch } from "../src/backend/services/csgo/csgoScoreMapper.js";

const useRealApi = process.env.PANDASCORE_USE_REAL_API === "true";

// Consulta uma página pequena da API real apenas quando o toggle está habilitado.
test(
  "fetches a Counter-Strike running-match page from PandaScore",
  { skip: !useRealApi },
  async () => {
    if (!process.env.PANDASCORE_TOKEN?.trim()) {
      throw new Error(
        "Set PANDASCORE_TOKEN in .env before enabling real API tests.",
      );
    }

    const { pandascore } = await import(
      "../src/backend/integrations/pandascore/client.js"
    );
    const response = await pandascore.get(
      PANDASCORE_ENDPOINTS.csgo.runningMatches,
      {
        params: {
          page: 1,
          per_page: 1,
        },
      },
    );

    assert.ok(Array.isArray(response.data));
    assert.ok(response.data.length <= 1);

    if (response.data.length === 1) {
      const match = mapCsgoMatch(response.data[0]);
      assert.ok(Number.isInteger(match.matchId));
      assert.ok(Array.isArray(match.teams));
    }
  },
);
