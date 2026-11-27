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
import { createDatabase } from "../src/backend/db/database.js";
import { getCsgoScoreCache } from "../src/backend/services/csgo/csgoScoreCache.js";
import { mapCsgoMatch } from "../src/backend/services/csgo/csgoScoreMapper.js";
import {
  purgeOldPandaScoreErrorLogs,
  recordPandaScoreError,
} from "../src/backend/integrations/pandascore/errorLog.js";
import { syncCsgoLiveScores } from "../src/backend/services/csgo/csgoLiveScores/csgoLiveScoreSync.js";

// Representa uma partida ao vivo com placares conhecidos para os testes.
const sampleMatch = {
  id: 123,
  slug: "team-a-vs-team-b",
  name: "Team A vs Team B",
  status: "running",
  begin_at: "2026-11-26T16:00:00Z",
  detailed_stats: true,
  draw: false,
  end_at: "2026-11-26T18:00:00Z",
  forfeit: false,
  game_advantage: null,
  league_id: 10,
  match_type: "best_of",
  modified_at: "2026-11-26T18:01:00Z",
  number_of_games: 3,
  original_scheduled_at: "2026-11-26T15:00:00Z",
  rescheduled: false,
  scheduled_at: "2026-11-26T15:30:00Z",
  serie_id: 20,
  tournament_id: 30,
  videogame: { id: 3, name: "Counter-Strike", slug: "cs-go" },
  videogame_title: null,
  videogame_version: { current: false, name: "1.0" },
  winner_id: 1,
  winner_type: "Team",
  league: {
    id: 10,
    name: "Premier League",
    slug: "premier-league",
    url: "https://league.example",
    image_url: "https://cdn.example/league.png",
  },
  serie: {
    id: 20,
    league_id: 10,
    name: "Season 1",
    slug: "season-1",
    full_name: "Season 1 2026",
    modified_at: "2026-11-25T10:00:00Z",
    season: "1",
    winner_id: null,
    winner_type: "Team",
    year: 2026,
  },
  tournament: {
    id: 30,
    serie_id: 20,
    name: "Group Stage",
    slug: "group-stage",
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
    { team_id: 1, score: 13 },
    { team_id: 2, score: 0 },
  ],
  games: [
    {
      id: 456,
      position: 1,
      status: "running",
      results: [
        { team_id: 1, score: 7 },
        { team_id: 2, score: 5 },
      ],
    },
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
};

// Confirma que o mapeamento preserva equipes e placares, inclusive o valor zero.
test("maps team scores, including a zero score", () => {
  assert.deepEqual(mapCsgoMatch(sampleMatch), {
    matchId: 123,
    leagueId: 10,
    seriesId: 20,
    tournamentId: 30,
    videogame: { id: 3, name: "Counter-Strike", slug: "cs-go" },
    slug: "team-a-vs-team-b",
    name: "Team A vs Team B",
    status: "running",
    beginAt: "2026-11-26T16:00:00Z",
    expectedBeginAt: null,
    endAt: "2026-11-26T18:00:00Z",
    detailedStats: 1,
    draw: 0,
    forfeit: 0,
    gameAdvantage: null,
    matchType: "best_of",
    modifiedAt: "2026-11-26T18:01:00Z",
    numberOfGames: 3,
    originalScheduledAt: "2026-11-26T15:00:00Z",
    rescheduled: 0,
    scheduledAt: "2026-11-26T15:30:00Z",
    videogameTitle: null,
    videogameVersion: { current: 0, name: "1.0" },
    winner: {
      id: 1,
      name: "Team A",
      slug: "team-a",
      acronym: "TA",
      imageUrl: "https://cdn.example/team-a.png",
      darkModeImageUrl: "https://cdn.example/team-a-dark.png",
      location: "US",
      modifiedAt: "2026-11-20T12:00:00Z",
    },
    winnerId: 1,
    winnerType: "Team",
    streamsList: [
      {
        position: 0,
        embedUrl: "https://player.example/embed",
        language: "en",
        main: 1,
        official: 1,
        rawUrl: "https://stream.example",
      },
    ],
    league: {
      id: 10,
      name: "Premier League",
      slug: "premier-league",
      beginAt: null,
      endAt: null,
      url: "https://league.example",
      imageUrl: "https://cdn.example/league.png",
      videogame: {
        name: "Counter-Strike",
        slug: "cs-go",
      },
    },
    series: {
      id: 20,
      name: "Season 1",
      slug: "season-1",
      beginAt: null,
      endAt: null,
      leagueId: 10,
      fullName: "Season 1 2026",
      modifiedAt: "2026-11-25T10:00:00Z",
      season: "1",
      winnerId: null,
      winnerType: "Team",
      year: 2026,
    },
    tournament: {
      id: 30,
      name: "Group Stage",
      slug: "group-stage",
      beginAt: "2026-11-21T14:00:00Z",
      endAt: "2026-12-12T22:00:00Z",
      seriesId: 20,
      leagueId: 10,
      tier: "d",
      type: "online/offline",
      country: null,
      detailedStats: 0,
      winnerId: null,
      winnerType: "Team",
      region: "WEU",
      modifiedAt: "2026-11-12T14:14:29Z",
      prizepool: "5000 Euro",
      hasBracket: 1,
      liveSupported: 0,
    },
    teams: [
      {
        id: 1,
        name: "Team A",
        slug: "team-a",
        acronym: "TA",
        imageUrl: "https://cdn.example/team-a.png",
        darkModeImageUrl: "https://cdn.example/team-a-dark.png",
        location: "US",
        modifiedAt: "2026-11-20T12:00:00Z",
        type: "Team",
        score: 13,
      },
      {
        id: 2,
        name: "Team B",
        slug: null,
        acronym: null,
        imageUrl: null,
        darkModeImageUrl: null,
        location: null,
        modifiedAt: null,
        type: "Team",
        score: 0,
      },
    ],
    opponents: [
      {
        type: "Team",
        opponent: {
          id: 1,
          name: "Team A",
          slug: "team-a",
          acronym: "TA",
          imageUrl: "https://cdn.example/team-a.png",
          darkModeImageUrl: "https://cdn.example/team-a-dark.png",
          location: "US",
          modifiedAt: "2026-11-20T12:00:00Z",
        },
      },
      {
        type: "Team",
        opponent: {
          id: 2,
          name: "Team B",
          slug: null,
          acronym: null,
          imageUrl: null,
          darkModeImageUrl: null,
          location: null,
          modifiedAt: null,
        },
      },
    ],
    results: [
      { teamId: 1, score: 13 },
      { teamId: 2, score: 0 },
    ],
    games: [
      {
        id: 456,
        position: 1,
        status: "running",
        beginAt: null,
        endAt: null,
        length: null,
        winnerId: null,
        winnerType: null,
        results: [
          { teamId: 1, score: 7 },
          { teamId: 2, score: 5 },
        ],
      },
    ],
  });
});

test("maps videogame metadata supplied with a league", () => {
  const mapped = mapCsgoMatch({
    ...sampleMatch,
    league: {
      ...sampleMatch.league,
      videogame: { name: "Dota 2", slug: "dota-2" },
    },
  });

  assert.deepEqual(mapped.league.videogame, {
    name: "Dota 2",
    slug: "dota-2",
  });
});

test("preserves competition IDs when nested entities are missing", () => {
  const mapped = mapCsgoMatch({
    id: 123,
    league_id: 10,
    serie_id: 20,
    tournament_id: 30,
  });

  assert.equal(mapped.leagueId, 10);
  assert.equal(mapped.series.leagueId, 10);
  assert.equal(mapped.tournament.seriesId, 20);
  assert.equal(mapped.tournament.leagueId, 10);
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
  assert.equal(
    db.prepare("SELECT league_id FROM series WHERE id = ?").get(20).league_id,
    10,
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
  assert.equal(
    db
      .prepare("SELECT series_id FROM tournaments WHERE id = ?")
      .get(30).series_id,
    20,
  );
  assert.deepEqual(
    db.prepare(`
      SELECT league_id, type, country, detailed_stats, winner_id, winner_type,
             region, modified_at, prizepool, has_bracket, live_supported
      FROM tournaments
      WHERE id = 30
    `).get(),
    {
      league_id: 10,
      type: "online/offline",
      country: null,
      detailed_stats: 0,
      winner_id: null,
      winner_type: "Team",
      region: "WEU",
      modified_at: "2026-11-12T14:14:29Z",
      prizepool: "5000 Euro",
      has_bracket: 1,
      live_supported: 0,
    },
  );
  assert.equal(
    db
      .prepare("SELECT tournament_id FROM matches WHERE id = ?")
      .get(123).tournament_id,
    30,
  );
  assert.deepEqual(
    db.prepare(`
      SELECT league_id, series_id, slug, detailed_stats, draw, forfeit,
             game_advantage, match_type, modified_at, number_of_games,
             original_scheduled_at, rescheduled, scheduled_at,
             videogame_title_id, videogame_version_current,
             videogame_version_name, winner_id, winner_type
      FROM matches
      WHERE id = 123
    `).get(),
    {
      league_id: 10,
      series_id: 20,
      slug: "team-a-vs-team-b",
      detailed_stats: 1,
      draw: 0,
      forfeit: 0,
      game_advantage: null,
      match_type: "best_of",
      modified_at: "2026-11-26T18:01:00Z",
      number_of_games: 3,
      original_scheduled_at: "2026-11-26T15:00:00Z",
      rescheduled: 0,
      scheduled_at: "2026-11-26T15:30:00Z",
      videogame_title_id: null,
      videogame_version_current: 0,
      videogame_version_name: "1.0",
      winner_id: 1,
      winner_type: "Team",
    },
  );
  assert.deepEqual(
    db.prepare(`
      SELECT v.pandascore_id, v.name, v.slug
      FROM matches m
      JOIN videogames v ON v.id = m.videogame_id
      WHERE m.id = 123
    `).get(),
    { pandascore_id: 3, name: "Counter-Strike", slug: "cs-go" },
  );
  assert.deepEqual(
    db.prepare(`
      SELECT position, embed_url, language, main, official, raw_url
      FROM match_streams
      WHERE match_id = 123
    `).get(),
    {
      position: 0,
      embed_url: "https://player.example/embed",
      language: "en",
      main: 1,
      official: 1,
      raw_url: "https://stream.example",
    },
  );
  assert.equal(
    db.prepare("SELECT opponent_type FROM match_teams WHERE match_id = 123 AND team_id = 1")
      .get().opponent_type,
    "Team",
  );
  assert.deepEqual(
    db.prepare(`
      SELECT dark_mode_image_url, location, modified_at
      FROM teams
      WHERE id = 1
    `).get(),
    {
      dark_mode_image_url: "https://cdn.example/team-a-dark.png",
      location: "US",
      modified_at: "2026-11-20T12:00:00Z",
    },
  );
  assert.equal(
    db
      .prepare("SELECT score FROM game_teams WHERE game_id = ? AND team_id = ?")
      .get(456, 1).score,
    7,
  );

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
    assert.equal(body.matches[0].league.id, 10);
    assert.equal(body.matches[0].league.videogame.slug, "cs-go");
    assert.equal(body.matches[0].league.url, "https://league.example");
    assert.equal(body.matches[0].league.imageUrl, "https://cdn.example/league.png");
    assert.equal(body.matches[0].series.id, 20);
    assert.equal(body.matches[0].series.fullName, "Season 1 2026");
    assert.equal(body.matches[0].tournament.id, 30);
    assert.equal(body.matches[0].tournament.detailedStats, false);
    assert.equal(body.matches[0].tournament.hasBracket, true);
    assert.equal(body.matches[0].tournament.liveSupported, false);
    assert.equal(body.matches[0].teams[0].darkModeImageUrl, "https://cdn.example/team-a-dark.png");
    assert.equal(body.matches[0].teams[0].location, "US");
    assert.equal(body.matches[0].slug, "team-a-vs-team-b");
    assert.equal(body.matches[0].detailedStats, true);
    assert.equal(body.matches[0].scheduledAt, "2026-11-26T15:30:00Z");
    assert.equal(body.matches[0].videogame.id, 3);
    assert.deepEqual(body.matches[0].streamsList, [
      {
        embedUrl: "https://player.example/embed",
        language: "en",
        main: true,
        official: true,
        rawUrl: "https://stream.example",
      },
    ]);
    assert.equal(calls.length, 1);

    const filteredUrl = new URL(
      `http://127.0.0.1:${address.port}/api/csgo/live-scores`,
    );
    filteredUrl.searchParams.set(
      "range[begin_at]",
      `${sampleMatch.begin_at},${sampleMatch.begin_at}`,
    );
    filteredUrl.searchParams.set("sort", "-begin_at");
    const filteredResponse = await fetch(filteredUrl);
    const filteredBody = await filteredResponse.json();
    assert.equal(filteredResponse.status, 200);
    assert.deepEqual(
      filteredBody.matches.map(({ matchId }) => matchId),
      [123],
    );

    const invalidSort = await fetch(
      `http://127.0.0.1:${address.port}/api/csgo/live-scores?sort=status`,
    );
    assert.equal(invalidSort.status, 400);
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

test("redacts the trimmed PandaScore token from error messages", (t) => {
  const db = createDatabase(":memory:");
  const previousToken = process.env.PANDASCORE_TOKEN;
  process.env.PANDASCORE_TOKEN = "  fake-pandascore-secret  ";
  t.after(() => {
    db.close();
    if (previousToken === undefined) {
      delete process.env.PANDASCORE_TOKEN;
    } else {
      process.env.PANDASCORE_TOKEN = previousToken;
    }
  });

  recordPandaScoreError(
    db,
    new Error("Request failed with fake-pandascore-secret"),
    { endpoint: "/csgo/matches/running" },
  );

  const log = db
    .prepare("SELECT message FROM api_error_logs ORDER BY id DESC")
    .get();
  assert.equal(log.message, "Request failed with [REDACTED]");
  assert.doesNotMatch(log.message, /fake-pandascore-secret/);
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
