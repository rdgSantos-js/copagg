import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { standingsPreview } from "../src/frontend/data/previewData.js";

let server;
let SwissStage;
let Standings;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  ({ default: SwissStage } = await server.ssrLoadModule("/src/frontend/components/SwissStage.jsx"));
  ({ default: Standings } = await server.ssrLoadModule("/src/frontend/components/Standings.jsx"));
});

after(async () => {
  if (server) await server.close();
});

test("renders supplied standings and independent Swiss rounds", () => {
  const html = renderToStaticMarkup(React.createElement(SwissStage, {
    standings: [{ team: { id: "a", name: "Equipe A", abbreviation: "A" }, wins: 1, losses: 0 }],
    rounds: [{
      id: "r1",
      title: "Rodada 1",
      matches: [{ id: "m1", teams: [{ name: "Equipe A", abbreviation: "A", score: 0 }, null] }],
    }],
  }));

  assert.match(html, /<td>1<\/td><td>0<\/td>/);
  assert.match(html, /<abbr title="Vitórias">V<\/abbr>/);
  assert.match(html, /<abbr title="Derrotas">D<\/abbr>/);
  assert.match(html, /Rodada 1/);
  assert.match(html, /team-score">0<\/strong>/);
  assert.match(html, /A definir/);
  assert.doesNotMatch(html, /bracket-slot|Upper Bracket|Lower Bracket/);
});

test("renders empty standings and rounds without inventing fixtures", () => {
  const html = renderToStaticMarkup(React.createElement(SwissStage, {
    standings: [],
    rounds: [{ id: "r2", title: "Rodada 2", matches: [] }],
  }));

  assert.match(html, /Classificação ainda não disponível/);
  assert.match(html, /Confrontos ainda não definidos/);
  assert.doesNotMatch(html, /bracket-match/);

  const noRounds = renderToStaticMarkup(React.createElement(SwissStage, {
    standings: [],
    rounds: [],
  }));
  assert.match(noRounds, /Rodadas ainda não disponíveis/);
});

test("renders standings independently with zero results or no teams", () => {
  const html = renderToStaticMarkup(React.createElement(Standings, {
    standings: [{ team: { id: "a", name: "Equipe A", abbreviation: "A" }, wins: 0, losses: 0 }],
  }));
  assert.match(html, /aria-label="Classificação"/);
  assert.match(html, /Equipe A/);
  assert.match(html, /<td>0<\/td><td>0<\/td>/);
  assert.match(
    renderToStaticMarkup(React.createElement(Standings, { standings: [] })),
    /Classificação ainda não disponível/,
  );
});

test("renders configured columns in order with zero, text and missing values", () => {
  const html = renderToStaticMarkup(React.createElement(Standings, {
    columns: [
      { key: "points", label: "P", title: "Pontos" },
      { key: "status", label: "Situação" },
      { key: "draws", label: "E" },
      { key: "missing", label: "M" },
    ],
    standings: [{
      team: { id: "a", name: "Equipe A", abbreviation: "A" },
      points: 0,
      status: "Classificado",
      draws: null,
    }],
  }));
  assert.match(html, /<abbr title="Pontos">P<\/abbr>/);
  assert.match(html, /<td>0<\/td><td>Classificado<\/td><td>—<\/td><td>—<\/td>/);
  assert.doesNotMatch(html, /Vitórias|Derrotas/);
});

test("rejects unsupported statistic values", () => {
  assert.throws(() => renderToStaticMarkup(React.createElement(Standings, {
    columns: [{ key: "points", label: "P" }],
    standings: [{ team: { id: "a", name: "Equipe A", abbreviation: "A" }, points: {} }],
  })), /Valor inválido na coluna "points"/);
});

test("standings preview displays draws consistently with games played", () => {
  const html = renderToStaticMarkup(React.createElement(Standings, standingsPreview));
  assert.match(html, /<abbr title="Empates">Empates<\/abbr>/);
  for (const entry of standingsPreview.standings) {
    assert.equal(entry.played, entry.wins + entry.draws + entry.losses);
  }
});

test("standings preview renders supplied round balance and points", () => {
  const [first, second] = standingsPreview.standings;
  const html = renderToStaticMarkup(React.createElement(Standings, {
    ...standingsPreview,
    standings: [first, { ...second, roundsBalance: null, points: null }],
  }));
  assert.match(html, /<abbr title="Saldo de rounds">Saldo de Rounds<\/abbr>/);
  assert.match(html, /<abbr title="Pontos">Pontos<\/abbr>/);
  assert.match(html, /<td>12<\/td><td class="standings-cell-bold">6<\/td>/);
  assert.match(html, /<td>—<\/td><td class="standings-cell-bold">—<\/td>/);
});

test("bold applies only to values in columns configured with true", () => {
  const html = renderToStaticMarkup(React.createElement(Standings, {
    columns: [
      { key: "points", label: "P", bold: true },
      { key: "wins", label: "V", bold: false },
      { key: "losses", label: "D" },
    ],
    standings: [{
      team: { id: "a", name: "Equipe A", abbreviation: "A" },
      points: 0,
      wins: 1,
      losses: 2,
    }],
  }));
  assert.match(html, /<td class="standings-cell-bold">0<\/td><td>1<\/td><td>2<\/td>/);
  assert.doesNotMatch(html, /<th[^>]*class="standings-cell-bold"/);
});
