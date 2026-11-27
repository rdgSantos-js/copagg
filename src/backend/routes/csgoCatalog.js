// ------------------------------------------------------------------------------------------
// Expõe consultas locais para teams, competições, partidas e jogos de Counter-Strike.
// ------------------------------------------------------------------------------------------




import { Router } from "express";
import { getDatabase } from "../db/database.js";
import {
  getCsgoEntity,
  getCsgoGame,
  getCsgoMatch,
  listCsgoEntities,
  listCsgoGames,
  listCsgoMatches,
  parseLocalDateOptions,
  parseLocalPagination,
} from "../services/csgoCatalogQueries.js";

const MATCH_STATES = ["upcoming", "running", "past"];

// Converte o ID de rota em inteiro positivo ou responde com erro de validação.
function parseId(request, response) {
  const id = Number(request.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    response.status(400).json({ error: "id must be a positive integer." });
    return null;
  }
  return id;
}

function parseTeamIdentifier(request, response) {
  const { id } = request.params;
  if (/^\d+$/.test(id)) {
    const numericId = Number(id);
    if (Number.isSafeInteger(numericId) && numericId > 0) {
      return numericId;
    }
  } else if (/^[a-z0-9_-]+$/.test(id)) {
    return id;
  }

  response.status(400).json({
    error: "team identifier must be a positive integer or a valid slug.",
  });
  return null;
}

function parseMatchIdentifier(request, response) {
  const { id } = request.params;
  if (/^\d+$/.test(id)) {
    const numericId = Number(id);
    if (Number.isSafeInteger(numericId) && numericId > 0) {
      return numericId;
    }
  } else if (/^[a-z0-9_-]+$/.test(id)) {
    return id;
  }

  response.status(400).json({
    error: "match identifier must be a positive integer or a valid slug.",
  });
  return null;
}

// Lê paginação e devolve erro se exceder os limites locais permitidos.
function getPagination(request, response) {
  const pagination = parseLocalPagination(request.query);
  if (!pagination) {
    response.status(400).json({
      error: "page must be positive and per_page must be between 1 and 100.",
    });
    return null;
  }
  return pagination;
}

// Responde com uma página de entidades persistidas localmente.
function listEntity(request, response, type, db, options = {}) {
  const pagination = getPagination(request, response);
  if (!pagination) {
    return;
  }
  const dateOptions = parseLocalDateOptions(request.query, type);
  if (dateOptions.error) {
    response.status(400).json({ error: dateOptions.error });
    return;
  }

  const search =
    typeof request.query.search === "string" ? request.query.search : "";
  const result = listCsgoEntities(
    type,
    {
      ...pagination,
      search,
      ...dateOptions,
      ...options,
    },
    db,
  );
  response.json(result);
}

// Responde com uma entidade local ou 404 sem consultar a PandaScore.
function getEntity(request, response, type, db) {
  const id = parseId(request, response);
  if (id === null) {
    return;
  }

  const entity = getCsgoEntity(type, id, db);
  if (!entity) {
    response.status(404).json({ error: `${type} entity not found locally.` });
    return;
  }
  response.json(entity);
}

// Lista partidas locais filtradas pelo estado ou pela entidade competitiva.
function listMatches(request, response, state, parentType, parentId, db) {
  const pagination = getPagination(request, response);
  if (!pagination) {
    return;
  }
  const dateOptions = parseLocalDateOptions(request.query, "matches");
  if (dateOptions.error) {
    response.status(400).json({ error: dateOptions.error });
    return;
  }
  response.json(
    listCsgoMatches(
      {
        ...pagination,
        ...dateOptions,
        state,
        parentType,
        parentId,
      },
      db,
    ),
  );
}

// Cria as rotas com a conexão padrão ou uma conexão isolada para testes.
export function createCsgoCatalogRouter(options = {}) {
  const router = Router();
  const getDb = options.db ? () => options.db : () => getDatabase();

  router.get("/teams", (request, response) =>
    listEntity(request, response, "teams", getDb()),
  );
  router.get("/teams/:id", (request, response) => {
    const id = parseTeamIdentifier(request, response);
    if (id === null) {
      return;
    }

    const team = getCsgoEntity("teams", id, getDb());
    if (!team) {
      response.status(404).json({ error: "Team not found locally." });
      return;
    }
    response.json(team);
  });

  // Lista as ligas sincronizadas e permite localizar uma liga por ID.
  router.get("/leagues", (request, response) =>
    listEntity(request, response, "leagues", getDb()),
  );
  router.get("/leagues/:id/series", (request, response) => {
    const id = parseId(request, response);
    if (id === null) {
      return;
    }
    if (!getCsgoEntity("leagues", id, getDb())) {
      response.status(404).json({ error: "League not found locally." });
      return;
    }
    listEntity(request, response, "series", getDb(), { parentId: id });
  });
  router.get("/leagues/:id/matches", (request, response) => {
    const id = parseId(request, response);
    if (id === null) {
      return;
    }
    if (!getCsgoEntity("leagues", id, getDb())) {
      response.status(404).json({ error: "League not found locally." });
      return;
    }
    listMatches(request, response, undefined, "league", id, getDb());
  });
  router.get("/leagues/:id", (request, response) =>
    getEntity(request, response, "leagues", getDb()),
  );

  // Lista as séries sincronizadas, suas ligas e torneios associados.
  router.get("/series", (request, response) =>
    listEntity(request, response, "series", getDb()),
  );
  router.get("/series/:id/tournaments", (request, response) => {
    const id = parseId(request, response);
    if (id === null) {
      return;
    }
    if (!getCsgoEntity("series", id, getDb())) {
      response.status(404).json({ error: "Series not found locally." });
      return;
    }
    listEntity(request, response, "tournaments", getDb(), { parentId: id });
  });
  router.get("/series/:id/matches", (request, response) => {
    const id = parseId(request, response);
    if (id === null) {
      return;
    }
    if (!getCsgoEntity("series", id, getDb())) {
      response.status(404).json({ error: "Series not found locally." });
      return;
    }
    listMatches(request, response, undefined, "series", id, getDb());
  });
  router.get("/series/:id", (request, response) =>
    getEntity(request, response, "series", getDb()),
  );

  // Lista torneios conhecidos e expõe o recorte de torneios futuros.
  router.get("/tournaments", (request, response) =>
    listEntity(request, response, "tournaments", getDb()),
  );
  router.get("/tournaments/upcoming", (request, response) =>
    listEntity(request, response, "tournaments", getDb(), { upcomingOnly: true }),
  );
  router.get("/tournaments/:id/matches", (request, response) => {
    const id = parseId(request, response);
    if (id === null) {
      return;
    }
    if (!getCsgoEntity("tournaments", id, getDb())) {
      response.status(404).json({ error: "Tournament not found locally." });
      return;
    }
    listMatches(request, response, undefined, "tournament", id, getDb());
  });
  router.get("/tournaments/:id", (request, response) =>
    getEntity(request, response, "tournaments", getDb()),
  );

  // Disponibiliza listas locais de partidas nos estados públicos da PandaScore.
  router.get("/matches", (request, response) => {
    const state =
      typeof request.query.state === "string" ? request.query.state : undefined;
    if (state && !MATCH_STATES.includes(state)) {
      response.status(400).json({
        error: "state must be upcoming, running, or past.",
      });
      return;
    }
    listMatches(request, response, state, undefined, undefined, getDb());
  });
  for (const state of MATCH_STATES) {
    router.get(`/matches/${state}`, (request, response) =>
      listMatches(request, response, state, undefined, undefined, getDb()),
    );
  }

  // Devolve jogos/mapas da partida somente quando vierem em dados já sincronizados.
  router.get("/matches/:id/games", (request, response) => {
    const id = parseId(request, response);
    if (id === null) {
      return;
    }
    if (!getCsgoMatch(id, getDb())) {
      response.status(404).json({ error: "Match not found locally." });
      return;
    }
    const pagination = getPagination(request, response);
    if (!pagination) {
      return;
    }
    const dateOptions = parseLocalDateOptions(request.query, "games");
    if (dateOptions.error) {
      response.status(400).json({ error: dateOptions.error });
      return;
    }
    response.json(
      listCsgoGames(id, { ...pagination, ...dateOptions }, getDb()),
    );
  });
  router.get("/matches/:id", (request, response) => {
    const id = parseMatchIdentifier(request, response);
    if (id === null) {
      return;
    }
    const match = getCsgoMatch(id, getDb());
    if (!match) {
      response.status(404).json({ error: "Match not found locally." });
      return;
    }
    response.json(match);
  });

  // Busca um jogo/mapa presente no SQLite, sem chamar endpoints Historical.
  router.get("/games/:id", (request, response) => {
    const id = parseId(request, response);
    if (id === null) {
      return;
    }
    const game = getCsgoGame(id, getDb());
    if (!game) {
      response.status(404).json({ error: "Game not found locally." });
      return;
    }
    response.json(game);
  });

  return router;
}

export default createCsgoCatalogRouter();
