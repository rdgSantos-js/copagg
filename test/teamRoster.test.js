import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server;
let TeamRoster;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
  ({ default: TeamRoster } = await server.ssrLoadModule("/src/frontend/components/TeamRoster.jsx"));
});

after(async () => {
  if (server) await server.close();
});

test("renders players and staff in separate groups with optional details", () => {
  const html = renderToStaticMarkup(React.createElement(TeamRoster, {
    players: [{ id: "p1", name: "Jogador", fullName: "Nome completo" }],
    staff: [{ id: "s1", name: "Pessoa", role: "Treinador", imageUrl: "https://example.com/avatar.png" }],
  }));

  assert.match(html, /<h3[^>]*>Jogadores<\/h3>/);
  assert.match(html, /Nome completo/);
  assert.match(html, /<h3[^>]*>Staff<\/h3>/);
  assert.match(html, /Treinador/);
  assert.match(html, /src="https:\/\/example\.com\/avatar\.png"/);
  assert.match(html, /<span>J<\/span>/);
});

test("handles a single group and an empty roster", () => {
  const staffOnly = renderToStaticMarkup(React.createElement(TeamRoster, {
    staff: [{ id: "s1", name: "Treinador" }],
  }));
  assert.match(staffOnly, /<h3[^>]*>Staff<\/h3>/);
  assert.doesNotMatch(staffOnly, /<h3[^>]*>Jogadores<\/h3>/);
  assert.match(renderToStaticMarkup(React.createElement(TeamRoster)), /Elenco ainda não disponível/);
});

test("shows a labeled flag beside the nickname only for valid country codes", () => {
  const html = renderToStaticMarkup(React.createElement(TeamRoster, {
    players: [
      { id: "p1", name: "Jogador", countryCode: "br", countryName: "Brasil" },
      { id: "p2", name: "Outro", countryCode: "invalid" },
      { id: "p3", name: "Sem país" },
    ],
  }));
  assert.match(html, /<strong>Jogador<\/strong><img src="https:\/\/flagsapi\.com\/BR\/flat\/24\.png" alt="Brasil"/);
  assert.equal((html.match(/<img src="https:\/\/flagsapi\.com/g) || []).length, 1);
});
