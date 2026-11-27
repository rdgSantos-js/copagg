// ------------------------------------------------------------------------------------------
// Valida a sincronização dos catálogos e as rotas locais da hierarquia de Counter-Strike.
// ------------------------------------------------------------------------------------------




import assert from "node:assert/strict";
import Database from "better-sqlite3";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDatabase } from "../src/db/database.js";
import { PANDASCORE_ENDPOINTS } from "../src/integrations/pandascore/endpoints.js";
import { createCsgoCatalogRouter } from "../src/routes/csgoCatalog.js";
import { syncCsgoCatalog } from "../src/services/csgoCatalogSync.js";
import {
  syncCsgoMatches,
} from "../src/services/csgoLiveScores/csgoLiveScoreSync.js";

test("migrates existing leagues to the videogames relation", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "copagg-db-migration-"));
  const databasePath = join(directory, "legacy.sqlite");
  const legacyDb = new Database(databasePath);
  legacyDb.exec(`
    CREATE TABLE leagues (
      id INTEGER PRIMARY KEY,
      name TEXT,
      slug TEXT
    );
    INSERT INTO leagues (id, name, slug)
    VALUES (10, 'League', 'league');
  `);
  legacyDb.close();

  let db;
  t.after(() => {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  db = createDatabase(databasePath);

  assert.deepEqual(
    db.prepare(`
      SELECT l.videogame_id, v.name, v.slug
      FROM leagues l
      JOIN videogames v ON v.id = l.videogame_id
      WHERE l.id = 10
    `).get(),
    { videogame_id: 1, name: "Counter-Strike", slug: "cs-go" },
  );
  assert.deepEqual(db.pragma("foreign_key_check"), []);
});

test("adds the PandaScore ID to an existing videogames table", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "copagg-videogames-migration-"));
  const databasePath = join(directory, "legacy.sqlite");
  const legacyDb = new Database(databasePath);
  legacyDb.exec(`
    CREATE TABLE videogames (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE
    );
    INSERT INTO videogames (id, name, slug)
    VALUES (1, 'Counter-Strike', 'csgo');
    CREATE TABLE leagues (
      id INTEGER PRIMARY KEY,
      name TEXT,
      slug TEXT,
      videogame_id INTEGER REFERENCES videogames(id)
    );
    INSERT INTO leagues (id, name, slug, videogame_id)
    VALUES (10, 'League', 'league', 1);
  `);
  legacyDb.close();

  let db;
  t.after(() => {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  db = createDatabase(databasePath);

  assert.ok(
    db.pragma("table_info(videogames)")
      .some((column) => column.name === "pandascore_id"),
  );
  assert.equal(
    db.prepare("SELECT pandascore_id FROM videogames WHERE slug = 'cs-go'")
      .get().pandascore_id,
    null,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM videogames").get().count,
    1,
  );
  assert.deepEqual(db.pragma("foreign_key_check"), []);
});

// Confirma que os catálogos são paginados e persistidos na hierarquia correta.
test("syncs league, series, and tournament catalogs", async (t) => {
  const db = createDatabase(":memory:");
  t.after(() => db.close());
  const calls = [];
  const responses = {
    [PANDASCORE_ENDPOINTS.videogames]: [
      { id: 3, name: "Counter-Strike", slug: "cs-go" },
      { id: 14, name: "Dota 2", slug: "dota-2" },
    ],
    [PANDASCORE_ENDPOINTS.csgo.leagues]: [
      { id: 10, name: "League", slug: "league" },
    ],
    [PANDASCORE_ENDPOINTS.csgo.series]: [
      { id: 20, league_id: 10, name: "Series", slug: "series" },
    ],
    [PANDASCORE_ENDPOINTS.csgo.upcomingTournaments]: [
      {
        id: 30,
        serie_id: 20,
        name: "Tournament",
        slug: "tournament",
        tier: "A",
        serie: { id: 20, league_id: 10 },
      },
    ],
  };
  const client = {
    async get(endpoint, { params }) {
      calls.push({ endpoint, ...params });
      return { data: responses[endpoint] };
    },
  };

  const results = await syncCsgoCatalog({ client, db });

  assert.deepEqual(results.map(({ total }) => total), [2, 1, 1, 1]);
  assert.deepEqual(
    calls.map(({ endpoint }) => endpoint),
    [
      PANDASCORE_ENDPOINTS.videogames,
      ...Object.values(PANDASCORE_ENDPOINTS.csgo).slice(0, 3),
    ],
  );
  assert.deepEqual(
    db.prepare(`
      SELECT pandascore_id, name, slug
      FROM videogames
      WHERE slug = 'dota-2'
    `).get(),
    { pandascore_id: 14, name: "Dota 2", slug: "dota-2" },
  );
  assert.equal(db.prepare("SELECT league_id FROM series WHERE id = 20").get().league_id, 10);
  assert.equal(
    db.prepare(`
      SELECT v.slug
      FROM leagues l
      JOIN videogames v ON v.id = l.videogame_id
      WHERE l.id = 10
    `).get().slug,
    "cs-go",
  );
  assert.equal(
    db.prepare("SELECT series_id FROM tournaments WHERE id = 30").get().series_id,
    20,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM sync_metadata").get().count,
    4,
  );
});

// Limita o histórico a 30 dias e encerra a paginação quando encontra dados antigos.
test("syncs only the last 30 days of past matches", async (t) => {
  const db = createDatabase(":memory:");
  t.after(() => db.close());
  const now = new Date("2026-12-01T00:00:00.000Z");
  const recentMatches = Array.from({ length: 100 }, (_, index) => ({
    id: 700 + index,
    status: "finished",
    begin_at: "2026-11-20T00:00:00.000Z",
    end_at: "2026-11-20T01:00:00.000Z",
    opponents: [],
  }));
  const oldMatches = Array.from({ length: 100 }, (_, index) => ({
    id: 800 + index,
    status: "finished",
    begin_at: "2026-10-20T00:00:00.000Z",
    end_at: "2026-10-20T01:00:00.000Z",
    opponents: [],
  }));
  const calls = [];
  const client = {
    async get(endpoint, { params }) {
      calls.push({ endpoint, params });
      return { data: params.page === 1 ? recentMatches : oldMatches };
    },
  };

  await syncCsgoMatches({ state: "past", client, db, now: () => now });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {
    endpoint: PANDASCORE_ENDPOINTS.csgo.pastMatches,
    params: { page: 1, per_page: 100, sort: "-begin_at" },
  });
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM matches").get().count,
    100,
  );
  assert.equal(
    db.prepare("SELECT last_success_at FROM sync_metadata WHERE sync_key = ?")
      .get("csgo_past").last_success_at,
    now.toISOString(),
  );
});

// Verifica as respostas de partidas e jogos usando apenas as tabelas locais.
test("serves catalog routes from SQLite and validates local pagination", async (t) => {
  const db = createDatabase(":memory:");
  const app = express();
  app.use("/api/csgo", createCsgoCatalogRouter({ db }));
  const server = app.listen(0);
  await once(server, "listening");
  t.after(async () => {
    server.close();
    await once(server, "close");
    db.close();
  });

  const beginAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const laterBeginAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const match = {
    id: 501,
    name: "Team A vs Team B",
    status: "not_started",
    begin_at: beginAt,
    league: { id: 10, name: "League" },
    serie: {
      id: 20,
      league_id: 10,
      name: "Series",
      begin_at: beginAt,
    },
    tournament: {
      id: 30,
      serie_id: 20,
      name: "Tournament",
      begin_at: beginAt,
    },
    opponents: [
      { opponent: { id: 1, name: "Team A" } },
      { opponent: { id: 2, name: "Team B" } },
    ],
    games: [
      {
        id: 601,
        position: 1,
        status: "not_started",
        begin_at: beginAt,
        results: [
          { team_id: 1, score: 0 },
          { team_id: 2, score: 0 },
        ],
      },
    ],
  };
  const laterMatch = {
    ...match,
    id: 502,
    begin_at: laterBeginAt,
    games: [
      {
        ...match.games[0],
        id: 602,
        begin_at: laterBeginAt,
      },
    ],
  };
  await syncCsgoMatches({
    state: "upcoming",
    db,
    client: { async get() { return { data: [match, laterMatch] }; } },
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/csgo`;
  const leagues = await fetch(`${baseUrl}/leagues`);
  const leagueBody = await leagues.json();
  assert.equal(leagueBody.data[0].id, 10);
  assert.equal(leagueBody.data[0].videogame.slug, "cs-go");

  const series = await fetch(`${baseUrl}/leagues/10/series`);
  assert.equal((await series.json()).data[0].id, 20);
  const seriesByDate = new URL(`${baseUrl}/series`);
  seriesByDate.searchParams.set("range[begin_at]", `${beginAt},${beginAt}`);
  assert.equal((await (await fetch(seriesByDate)).json()).data[0].id, 20);

  const tournaments = await fetch(`${baseUrl}/series/20/tournaments`);
  assert.equal((await tournaments.json()).data[0].id, 30);
  const tournamentsByDate = new URL(`${baseUrl}/tournaments`);
  tournamentsByDate.searchParams.set(
    "range[begin_at]",
    `${beginAt},${beginAt}`,
  );
  assert.equal((await (await fetch(tournamentsByDate)).json()).data[0].id, 30);

  const upcoming = await fetch(`${baseUrl}/matches/upcoming`);
  const upcomingBody = await upcoming.json();
  assert.equal(upcoming.status, 200);
  assert.equal(upcomingBody.data[0].matchId, 502);
  assert.equal(upcomingBody.data[0].league.id, 10);
  assert.equal(upcomingBody.data[0].league.videogame.slug, "cs-go");

  const matchesByDate = new URL(`${baseUrl}/matches`);
  matchesByDate.searchParams.set(
    "range[begin_at]",
    `${laterBeginAt},${laterBeginAt}`,
  );
  matchesByDate.searchParams.set("sort", "-begin_at");
  const matchesByDateResponse = await fetch(matchesByDate);
  const matchesByDateBody = await matchesByDateResponse.json();
  assert.equal(matchesByDateResponse.status, 200);
  assert.deepEqual(
    matchesByDateBody.data.map(({ matchId }) => matchId),
    [502],
  );

  const sortedMatches = await fetch(`${baseUrl}/matches?sort=begin_at`);
  const sortedMatchesBody = await sortedMatches.json();
  assert.deepEqual(
    sortedMatchesBody.data.map(({ matchId }) => matchId),
    [501, 502],
  );
  const reverseSortedMatches = await fetch(`${baseUrl}/matches?sort=-begin_at`);
  const reverseSortedMatchesBody = await reverseSortedMatches.json();
  assert.deepEqual(
    reverseSortedMatchesBody.data.map(({ matchId }) => matchId),
    [502, 501],
  );

  const invalidDateRange = new URL(`${baseUrl}/matches`);
  invalidDateRange.searchParams.set(
    "range[begin_at]",
    `${laterBeginAt},${beginAt}`,
  );
  assert.equal((await fetch(invalidDateRange)).status, 400);
  assert.equal(
    (await fetch(`${baseUrl}/matches?sort=status`)).status,
    400,
  );

  const matchDetail = await fetch(`${baseUrl}/matches/501`);
  assert.equal((await matchDetail.json()).matchId, 501);

  const games = await fetch(`${baseUrl}/matches/501/games`);
  const gamesBody = await games.json();
  assert.equal(games.status, 200);
  assert.equal(gamesBody.data[0].id, 601);
  assert.equal(gamesBody.data[0].teams[0].score, 0);

  const gamesByDate = new URL(`${baseUrl}/matches/501/games`);
  gamesByDate.searchParams.set("range[begin_at]", `${beginAt},${beginAt}`);
  gamesByDate.searchParams.set("sort", "-begin_at");
  const gamesByDateBody = await (await fetch(gamesByDate)).json();
  assert.deepEqual(
    gamesByDateBody.data.map(({ id }) => id),
    [601],
  );

  const gameDetail = await fetch(`${baseUrl}/games/601`);
  assert.equal((await gameDetail.json()).matchId, 501);

  const invalidPagination = await fetch(`${baseUrl}/leagues?per_page=101`);
  assert.equal(invalidPagination.status, 400);
  const missingMatch = await fetch(`${baseUrl}/matches/999`);
  assert.equal(missingMatch.status, 404);
});
