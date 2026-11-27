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
import { createDatabase } from "../src/backend/db/database.js";
import { PANDASCORE_ENDPOINTS } from "../src/backend/integrations/pandascore/endpoints.js";
import { createCsgoCatalogRouter } from "../src/backend/routes/csgo/csgoCatalog.js";
import { syncCsgoCatalog } from "../src/backend/services/csgo/csgoCatalogSync.js";
import {
  syncCsgoMatches,
} from "../src/backend/services/csgo/csgoLiveScores/csgoLiveScoreSync.js";

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
    CREATE TABLE teams (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      acronym TEXT,
      image_url TEXT
    );
    INSERT INTO teams (id, name, slug, acronym, image_url)
    VALUES (1804, 'VGJ.Thunder', 'vgj-thunder', 'VGJ.T',
            'https://cdn.example/vgj.png');
    CREATE TABLE series (
      id INTEGER PRIMARY KEY,
      league_id INTEGER REFERENCES leagues(id),
      name TEXT,
      slug TEXT,
      begin_at TEXT,
      end_at TEXT
    );
    INSERT INTO series (id, league_id, name, slug)
    VALUES (20, 10, 'Series', 'series');
    CREATE TABLE tournaments (
      id INTEGER PRIMARY KEY,
      series_id INTEGER REFERENCES series(id),
      name TEXT,
      slug TEXT,
      tier TEXT,
      begin_at TEXT,
      end_at TEXT
    );
    INSERT INTO tournaments (id, series_id, name, slug)
    VALUES (30, 20, 'Tournament', 'tournament');
    CREATE TABLE matches (
      id INTEGER PRIMARY KEY,
      tournament_id INTEGER REFERENCES tournaments(id),
      name TEXT,
      status TEXT NOT NULL,
      begin_at TEXT,
      expected_begin_at TEXT,
      end_at TEXT,
      is_running INTEGER NOT NULL DEFAULT 1,
      fetched_at TEXT NOT NULL
    );
    INSERT INTO matches (id, tournament_id, name, status, fetched_at)
    VALUES (40, 30, 'Match', 'finished', '2026-11-27T00:00:00Z');
    CREATE TABLE match_teams (
      match_id INTEGER NOT NULL REFERENCES matches(id),
      team_id INTEGER NOT NULL REFERENCES teams(id),
      score INTEGER,
      PRIMARY KEY (match_id, team_id)
    );
    INSERT INTO match_teams (match_id, team_id, score)
    VALUES (40, 1804, 2);
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
  assert.deepEqual(
    db.pragma("table_info(leagues)")
      .filter((column) => ["url", "image_url"].includes(column.name))
      .map((column) => column.name),
    ["url", "image_url"],
  );
  assert.deepEqual(
    db.pragma("table_info(series)")
      .filter((column) =>
        ["full_name", "modified_at", "season", "winner_id", "winner_type", "year"]
          .includes(column.name),
      )
      .map((column) => column.name),
    ["full_name", "modified_at", "season", "winner_id", "winner_type", "year"],
  );
  assert.equal(db.prepare("SELECT name FROM series WHERE id = 20").get().name, "Series");
  assert.deepEqual(
    db.pragma("table_info(tournaments)")
      .filter((column) =>
        [
          "league_id",
          "type",
          "country",
          "detailed_stats",
          "winner_id",
          "winner_type",
          "region",
          "modified_at",
          "prizepool",
          "has_bracket",
          "live_supported",
        ].includes(column.name),
      )
      .map((column) => column.name),
    [
      "league_id",
      "type",
      "country",
      "detailed_stats",
      "winner_id",
      "winner_type",
      "region",
      "modified_at",
      "prizepool",
      "has_bracket",
      "live_supported",
    ],
  );
  assert.equal(
    db.prepare("SELECT name FROM tournaments WHERE id = 30").get().name,
    "Tournament",
  );
  assert.deepEqual(
    db.pragma("table_info(teams)")
      .filter((column) =>
        ["dark_mode_image_url", "location", "modified_at"].includes(column.name),
      )
      .map((column) => column.name),
    ["dark_mode_image_url", "location", "modified_at"],
  );
  assert.deepEqual(
    db.prepare("SELECT name, slug, acronym, image_url FROM teams WHERE id = 1804")
      .get(),
    {
      name: "VGJ.Thunder",
      slug: "vgj-thunder",
      acronym: "VGJ.T",
      image_url: "https://cdn.example/vgj.png",
    },
  );
  assert.deepEqual(
    db.pragma("table_info(matches)")
      .filter((column) =>
        [
          "league_id",
          "series_id",
          "videogame_id",
          "slug",
          "scheduled_at",
          "original_scheduled_at",
          "detailed_stats",
          "draw",
          "forfeit",
          "game_advantage",
          "match_type",
          "modified_at",
          "number_of_games",
          "rescheduled",
          "videogame_title_id",
          "videogame_title_name",
          "videogame_title_slug",
          "videogame_title_videogame_id",
          "videogame_version_current",
          "videogame_version_name",
          "winner_id",
          "winner_type",
        ].includes(column.name),
      )
      .map((column) => column.name),
    [
      "league_id",
      "series_id",
      "videogame_id",
      "slug",
      "scheduled_at",
      "original_scheduled_at",
      "detailed_stats",
      "draw",
      "forfeit",
      "game_advantage",
      "match_type",
      "modified_at",
      "number_of_games",
      "rescheduled",
      "videogame_title_id",
      "videogame_title_name",
      "videogame_title_slug",
      "videogame_title_videogame_id",
      "videogame_version_current",
      "videogame_version_name",
      "winner_id",
      "winner_type",
    ],
  );
  assert.deepEqual(
    db.pragma("table_info(match_teams)")
      .filter((column) => column.name === "opponent_type")
      .map((column) => column.name),
    ["opponent_type"],
  );
  assert.equal(
    db.prepare("SELECT score FROM match_teams WHERE match_id = 40 AND team_id = 1804")
      .get().score,
    2,
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
      {
        id: 10,
        name: "League",
        slug: "league",
        url: "https://league.example",
        image_url: "https://cdn.example/league.png",
      },
    ],
    [PANDASCORE_ENDPOINTS.csgo.series]: [
      {
        id: 20,
        league_id: 10,
        name: "Series",
        slug: "series",
        begin_at: "2025-01-12T21:00:00Z",
        end_at: null,
        full_name: "Raleigh: North America Open Qualifier 1 2025",
        modified_at: "2025-01-12T22:42:15Z",
        season: null,
        winner_id: 44,
        winner_type: "Team",
        year: 2025,
      },
    ],
    [PANDASCORE_ENDPOINTS.csgo.upcomingTournaments]: [
      {
        id: 30,
        serie_id: 20,
        name: "Tournament",
        slug: "tournament",
        type: "online/offline",
        country: null,
        begin_at: "2026-11-21T14:00:00Z",
        detailed_stats: false,
        end_at: "2026-12-12T22:00:00Z",
        winner_id: null,
        winner_type: "Team",
        region: "WEU",
        modified_at: "2026-11-12T14:14:29Z",
        league_id: 10,
        prizepool: "5000 Euro",
        tier: "d",
        has_bracket: true,
        live_supported: false,
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
  assert.deepEqual(
    db.prepare(`
      SELECT full_name, modified_at, season, winner_id, winner_type, year
      FROM series
      WHERE id = 20
    `).get(),
    {
      full_name: "Raleigh: North America Open Qualifier 1 2025",
      modified_at: "2025-01-12T22:42:15Z",
      season: null,
      winner_id: 44,
      winner_type: "Team",
      year: 2025,
    },
  );
  assert.equal(
    db.prepare(`
      SELECT v.slug
      FROM leagues l
      JOIN videogames v ON v.id = l.videogame_id
      WHERE l.id = 10
    `).get().slug,
    "cs-go",
  );
  assert.deepEqual(
    db.prepare("SELECT url, image_url FROM leagues WHERE id = 10").get(),
    {
      url: "https://league.example",
      image_url: "https://cdn.example/league.png",
    },
  );
  assert.equal(
    db.prepare("SELECT series_id FROM tournaments WHERE id = 30").get().series_id,
    20,
  );
  assert.deepEqual(
    db.prepare(`
      SELECT league_id, type, country, begin_at, detailed_stats, end_at,
             winner_id, winner_type, region, modified_at, prizepool, tier,
             has_bracket, live_supported
      FROM tournaments
      WHERE id = 30
    `).get(),
    {
      league_id: 10,
      type: "online/offline",
      country: null,
      begin_at: "2026-11-21T14:00:00Z",
      detailed_stats: 0,
      end_at: "2026-12-12T22:00:00Z",
      winner_id: null,
      winner_type: "Team",
      region: "WEU",
      modified_at: "2026-11-12T14:14:29Z",
      prizepool: "5000 Euro",
      tier: "d",
      has_bracket: 1,
      live_supported: 0,
    },
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
  const recentMatches = Array.from({ length: 99 }, (_, index) => ({
    id: 700 + index,
    status: "finished",
    begin_at: "2026-11-20T00:00:00.000Z",
    end_at: "2026-11-20T01:00:00.000Z",
    opponents: [],
  }));
  recentMatches.push({
    id: 799,
    status: "finished",
    begin_at: "2026-11-01T01:00:00+02:00",
    end_at: "2026-11-01T02:00:00+02:00",
    opponents: [],
  });
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
    99,
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
    slug: "team-a-vs-team-b",
    name: "Team A vs Team B",
    status: "not_started",
    begin_at: beginAt,
    detailed_stats: true,
    draw: false,
    end_at: "2026-11-27T18:00:00Z",
    forfeit: false,
    game_advantage: null,
    league_id: 10,
    match_type: "best_of",
    modified_at: "2026-11-27T18:01:00Z",
    number_of_games: 3,
    original_scheduled_at: beginAt,
    rescheduled: false,
    scheduled_at: beginAt,
    serie_id: 20,
    tournament_id: 30,
    videogame: { id: 3, name: "Counter-Strike", slug: "cs-go" },
    videogame_title: null,
    videogame_version: { current: true, name: "1.0" },
    winner_id: 1,
    winner_type: "Team",
    league: {
      id: 10,
      name: "League",
      url: "https://league.example",
      image_url: "https://cdn.example/league.png",
    },
    serie: {
      id: 20,
      league_id: 10,
      name: "Series",
      begin_at: beginAt,
      full_name: "Raleigh: North America Open Qualifier 1 2025",
      modified_at: "2025-01-12T22:42:15Z",
      season: null,
      winner_id: 44,
      winner_type: "Team",
      year: 2025,
    },
    tournament: {
      id: 30,
      serie_id: 20,
      name: "Tournament",
      begin_at: beginAt,
      type: "online/offline",
      country: "DE",
      detailed_stats: true,
      end_at: "2026-12-12T22:00:00Z",
      winner_id: null,
      winner_type: "Team",
      region: "WEU",
      modified_at: "2026-11-12T14:14:29Z",
      league_id: 10,
      prizepool: "5000 Euro",
      tier: "d",
      has_bracket: true,
      live_supported: false,
    },
    opponents: [
      {
        type: "Team",
        opponent: {
          id: 1,
          name: "Team A",
          slug: "team-a",
          acronym: "TA",
          image_url: "https://cdn.example/team-a.png",
          dark_mode_image_url: "https://cdn.example/team-a-dark.png",
          location: "US",
          modified_at: "2026-11-20T12:00:00Z",
        },
      },
      { type: "Team", opponent: { id: 2, name: "Team B" } },
    ],
    results: [
      { team_id: 1, score: 0 },
      { team_id: 2, score: 0 },
    ],
    streams_list: [
      {
        embed_url: "https://player.example/embed",
        language: "en",
        main: true,
        official: true,
        raw_url: "https://stream.example",
      },
    ],
    winner: {
      id: 1,
      name: "Team A",
      slug: "team-a",
      acronym: "TA",
      image_url: "https://cdn.example/team-a.png",
      dark_mode_image_url: "https://cdn.example/team-a-dark.png",
      location: "US",
      modified_at: "2026-11-20T12:00:00Z",
    },
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
    slug: "team-a-vs-team-b-2",
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
  assert.equal(leagueBody.data[0].url, "https://league.example");
  assert.equal(leagueBody.data[0].imageUrl, "https://cdn.example/league.png");

  const teams = await fetch(`${baseUrl}/teams?search=TA`);
  const teamsBody = await teams.json();
  assert.deepEqual(teamsBody.data, [
    {
      id: 1,
      acronym: "TA",
      darkModeImageUrl: "https://cdn.example/team-a-dark.png",
      imageUrl: "https://cdn.example/team-a.png",
      location: "US",
      modifiedAt: "2026-11-20T12:00:00Z",
      name: "Team A",
      slug: "team-a",
    },
  ]);
  const teamBySlug = await fetch(`${baseUrl}/teams/team-a`);
  assert.deepEqual(await teamBySlug.json(), teamsBody.data[0]);
  const teamById = await fetch(`${baseUrl}/teams/1`);
  assert.equal((await teamById.json()).id, 1);
  assert.equal((await fetch(`${baseUrl}/teams/missing-team`)).status, 404);

  const series = await fetch(`${baseUrl}/leagues/10/series`);
  const seriesBody = await series.json();
  assert.equal(seriesBody.data[0].id, 20);
  assert.equal(
    seriesBody.data[0].fullName,
    "Raleigh: North America Open Qualifier 1 2025",
  );
  const seriesByDate = new URL(`${baseUrl}/series`);
  seriesByDate.searchParams.set("range[begin_at]", `${beginAt},${beginAt}`);
  assert.equal((await (await fetch(seriesByDate)).json()).data[0].id, 20);

  const tournaments = await fetch(`${baseUrl}/series/20/tournaments`);
  const tournamentsBody = await tournaments.json();
  assert.equal(tournamentsBody.data[0].id, 30);
  assert.deepEqual(
    {
      type: tournamentsBody.data[0].type,
      country: tournamentsBody.data[0].country,
      detailedStats: tournamentsBody.data[0].detailedStats,
      winnerType: tournamentsBody.data[0].winnerType,
      region: tournamentsBody.data[0].region,
      prizepool: tournamentsBody.data[0].prizepool,
      tier: tournamentsBody.data[0].tier,
      hasBracket: tournamentsBody.data[0].hasBracket,
      liveSupported: tournamentsBody.data[0].liveSupported,
    },
    {
      type: "online/offline",
      country: "DE",
      detailedStats: true,
      winnerType: "Team",
      region: "WEU",
      prizepool: "5000 Euro",
      tier: "d",
      hasBracket: true,
      liveSupported: false,
    },
  );
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
  assert.equal(upcomingBody.data[0].league.url, "https://league.example");
  assert.equal(upcomingBody.data[0].league.imageUrl, "https://cdn.example/league.png");

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
  const matchBySlug = await fetch(`${baseUrl}/matches/team-a-vs-team-b`);
  const matchBySlugBody = await matchBySlug.json();
  assert.equal(matchBySlugBody.matchId, 501);
  assert.equal(matchBySlugBody.detailedStats, true);
  assert.equal(matchBySlugBody.draw, false);
  assert.equal(matchBySlugBody.matchType, "best_of");
  assert.equal(matchBySlugBody.numberOfGames, 3);
  assert.equal(matchBySlugBody.videogame.id, 3);
  assert.equal(matchBySlugBody.videogameVersion.current, true);
  assert.equal(matchBySlugBody.winner.name, "Team A");
  assert.deepEqual(matchBySlugBody.streamsList, [
    {
      embedUrl: "https://player.example/embed",
      language: "en",
      main: true,
      official: true,
      rawUrl: "https://stream.example",
    },
  ]);
  assert.equal(matchBySlugBody.opponents[0].type, "Team");
  assert.deepEqual(matchBySlugBody.results, [
    { teamId: 1, score: 0 },
    { teamId: 2, score: 0 },
  ]);

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
