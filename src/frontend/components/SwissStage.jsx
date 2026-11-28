import { useId } from "react";
import BracketMatch from "./BracketMatch.jsx";
import Standings from "./Standings.jsx";

function SwissStage({ standings, rounds }) {
  const headingId = useId();

  return (
    <div className="swiss-stage">
      <section className="swiss-standings" aria-labelledby={`${headingId}-standings`}>
        <h3 id={`${headingId}-standings`}>Classificação</h3>
        <Standings standings={standings} />
      </section>

      <section className="swiss-rounds-section" aria-labelledby={`${headingId}-rounds`}>
        <h3 id={`${headingId}-rounds`}>Rodadas</h3>
        {rounds.length > 0 ? (
          <div className="swiss-rounds-scroll" tabIndex={0} role="region" aria-label="Rodadas da fase suíça">
            <div className="swiss-rounds">
              {rounds.map((round) => (
                <section className="swiss-round" key={round.id}>
                  <h4 className="bracket-round-title">{round.title}</h4>
                  <div className="swiss-round-matches">
                    {round.matches.length > 0 ? (
                      round.matches.map((match) => <BracketMatch key={match.id} match={match} />)
                    ) : (
                      <p className="swiss-empty">Confrontos ainda não definidos.</p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <p className="swiss-empty">Rodadas ainda não disponíveis.</p>
        )}
      </section>
    </div>
  );
}

export default SwissStage;
