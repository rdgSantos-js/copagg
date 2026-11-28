import { useEffect, useState } from "react";
import BrandMark from "./components/BrandMark.jsx";
import Icon from "./components/Icon.jsx";
import HorizontalMatchList from "./components/HorizontalMatchList.jsx";
import HeaderCard from "./components/HeaderCard.jsx";
import Bracket from "./components/Bracket.jsx";
import MatchCard from "./components/MatchCard.jsx";
import MatchColumn from "./components/MatchColumn.jsx";
import SectionHeading from "./components/SectionHeading.jsx";
import Standings from "./components/Standings.jsx";
import SwissStage from "./components/SwissStage.jsx";
import TeamRoster from "./components/TeamRoster.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import {
  bracketPreview,
  columnMatches,
  featuredPlayer,
  featuredTeam,
  featuredTournament,
  matchFilters,
  matches,
  navigation,
  palette,
  standingsPreview,
  swissStagePreview,
  teamRosterPreview,
} from "./data/previewData.js";

function readThemeMode() {
  const savedTheme = window.localStorage.getItem("copagg-theme");
  return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system";
}

function App() {
  const [themeMode, setThemeMode] = useState(readThemeMode);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [activeFilter, setActiveFilter] = useState("Todas");
  const theme = themeMode === "system" ? (systemDark ? "dark" : "light") : themeMode;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = (event) => setSystemDark(event.matches);
    preference.addEventListener("change", updateSystemTheme);
    return () => preference.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (themeMode === "system") {
      window.localStorage.removeItem("copagg-theme");
    } else {
      window.localStorage.setItem("copagg-theme", themeMode);
    }
  }, [theme, themeMode]);

  function toggleTheme() {
    setThemeMode(theme === "dark" ? "light" : "dark");
  }

  return (
    <div className="app-shell">
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-start">
            <BrandMark />
            <nav className="main-nav" aria-label="Navegação principal">
              {navigation.map((item, index) => (
                <a
                  className={`nav-link ${index === 0 ? "nav-link-active" : ""}`}
                  href="#"
                  key={item}
                  aria-current={index === 0 ? "page" : undefined}
                >
                  <span className={`nav-indicator nav-indicator-${index}`} />
                  {item}
                </a>
              ))}
            </nav>
          </div>
          <div className="topbar-actions">
            <span className="preview-label">PREVIEW</span>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <div className="avatar" aria-label="Perfil de usuário">
              C
            </div>
          </div>
        </header>
        <div className="page-content">
          <section className="welcome-panel">
            <div className="welcome-copy">
              <span className="welcome-tag">
                <span className="welcome-tag-dot" />
                SISTEMA VISUAL · VERSÃO 01
              </span>
              <h1>O jogo começa <span>por aqui.</span></h1>
              <p>
                Uma prévia dos componentes e da linguagem visual que vão dar vida
                ao Copa.gg.
              </p>
            </div>
            <div className="welcome-art" aria-hidden="true">
              <div className="art-ring art-ring-one" />
              <div className="art-ring art-ring-two" />
              <div className="art-core">C</div>
              <span className="art-spark art-spark-one">+</span>
              <span className="art-spark art-spark-two">+</span>
            </div>
          </section>

          <section className="content-section">
            <SectionHeading
              eyebrow="01 — PALETA"
              title="Cores que entram em jogo"
              description="Uma base forte e versátil, pensada para funcionar nos dois temas."
            />
            <div className="palette-grid">
              {palette.map((color) => (
                <div className="palette-item" key={color.hex}>
                  <div className={`color-swatch ${color.className}`} />
                  <div className="palette-meta">
                    <span>{color.label}</span>
                    <code>{color.hex}</code>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="content-section">
            <SectionHeading
              eyebrow="02 — ELEMENTOS"
              title="Peças fundamentais"
              description="Ações, estados e superfícies que mantêm a interface consistente."
            />
            <div className="component-grid">
              <article className="showcase-card buttons-showcase">
                <div className="showcase-title">
                  <div>
                    <h3>Botões</h3>
                    <p>Hierarquia clara para cada ação.</p>
                  </div>
                  <span className="component-index">A1</span>
                </div>
                <div className="button-examples">
                  <button className="button button-primary" type="button">
                    Ação principal <Icon name="arrow" />
                  </button>
                  <button className="button button-secondary" type="button">
                    Secundário
                  </button>
                  <button className="button button-quiet" type="button">
                    Discreto
                  </button>
                </div>
                <div className="showcase-divider" />
                <div className="field-example">
                  <label htmlFor="search-preview">Campo de busca</label>
                  <div className="input-wrap">
                    <span className="search-icon" aria-hidden="true">⌕</span>
                    <input
                      id="search-preview"
                      type="search"
                      placeholder="Buscar time ou torneio"
                    />
                    <kbd>⌘ K</kbd>
                  </div>
                </div>
              </article>

              <article className="showcase-card status-showcase">
                <div className="showcase-title">
                  <div>
                    <h3>Estados</h3>
                    <p>Informação visível de primeira.</p>
                  </div>
                  <span className="component-index">A2</span>
                </div>
                <div className="status-examples">
                  <span className="status-badge status-live"><span className="live-dot" /> AO VIVO</span>
                  <span className="status-badge status-upcoming">EM BREVE</span>
                  <span className="status-badge status-complete">ENCERRADA</span>
                  <span className="status-badge status-neutral">MELHOR DE 3</span>
                </div>
                <div className="showcase-divider" />
                <div className="mini-stat">
                  <span className="mini-stat-icon">↗</span>
                  <span>
                    <strong>Ao vivo agora</strong>
                    <small>Partidas em andamento</small>
                  </span>
                  <b>08</b>
                </div>
              </article>
            </div>
          </section>

          <section className="content-section matches-section">
            <SectionHeading
              eyebrow="03 — CARTÕES"
              title="Partidas em destaque"
              description="Um exemplo de como placares e agenda podem aparecer."
              action={
                <button className="text-button" type="button">
                  Ver todas <Icon name="arrow" />
                </button>
              }
            />
            <div className="filter-row" role="group" aria-label="Filtrar partidas">
              {matchFilters.map((filter) => (
                <button
                  className={`filter-chip ${activeFilter === filter ? "filter-chip-active" : ""}`}
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  type="button"
                  aria-pressed={activeFilter === filter}
                >
                  {filter === "Ao vivo" && <span className="filter-live-dot" />}
                  {filter}
                </button>
              ))}
            </div>
            <div className="match-grid">
              {matches
                .filter((match) => {
                  if (activeFilter === "Ao vivo") return match.statusType === "live";
                  if (activeFilter === "Próximas") return match.statusType === "upcoming";
                  return true;
                })
                .map((match) => <MatchCard key={match.competition} match={match} />)}
            </div>
          </section>

          <section className="content-section two-column-section">
            <div className="two-column-item">
              <SectionHeading
                eyebrow="04 — COLUNA"
                title="Jogos empilhados"
                description="Oito partidas demonstrativas em uma única coluna."
              />
              <MatchColumn matches={columnMatches} />
            </div>

            <div className="two-column-item">
              <SectionHeading
                eyebrow="05 — CABEÇALHO"
                title="Cabeçalho para times, campeonatos e jogadores"
                description="Identidade, apresentação, infos e redes sociais em um só componente."
              />
              <div className="header-card-list">
                <HeaderCard {...featuredTeam} />
                <HeaderCard {...featuredTournament} />
                <HeaderCard {...featuredPlayer} />
              </div>
            </div>
          </section>

          <section className="content-section">
            <SectionHeading
              eyebrow="06 — ELENCO"
              title="Time: jogadores e staff"
              description="Exemplo ilustrativo de jogadores e staff da FURIA de Counter-Strike 2."
            />
            <TeamRoster {...teamRosterPreview} />
          </section>

          <section className="content-section">
            <SectionHeading
              eyebrow="07 — LISTA HORIZONTAL"
              title="Placar em linha"
              description="Status, times, placar e contexto em cada linha da lista."
            />
            <HorizontalMatchList matches={columnMatches} />
          </section>

          <section className="content-section">
            <SectionHeading
              eyebrow="08 — MATA-MATA"
              title="Chaveamento Upper e Lower"
              description="Fases eliminatórias com upper bracket, lower bracket e grande final."
            />
            <Bracket {...bracketPreview} />
          </section>

          <section className="content-section">
            <SectionHeading
              eyebrow="09 — FASE SUÍÇA"
              title="Rodadas e classificação"
              description="Confrontos por rodada e campanha de cada equipe."
            />
            <SwissStage {...swissStagePreview} />
          </section>

          <section className="content-section">
            <SectionHeading
              eyebrow="10 — CLASSIFICAÇÃO"
              title="Classificação de equipes"
              description="Jogos disputados, vitórias, derrotas e demais dados."
            />
            <div className="standings-preview" role="region" aria-label="Classificação de equipes" tabIndex={0}>
              <Standings {...standingsPreview} />
            </div>
          </section>

          <footer className="page-footer">
            <span>© 2026 Copa.gg</span>
            <span>Feito para quem vive o jogo.</span>
            <span className="footer-version"><span /> UI kit v0.1</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
