import BracketMatch from "./BracketMatch.jsx";

function BracketRounds({ rounds }) {
  return (
    <div className="bracket-rounds">
      {rounds.map((round, index) => {
        const next = rounds[index + 1];
        const paired = next && round.matches.length === next.matches.length * 2;
        const connector = next ? (paired ? "paired" : "straight") : "none";
        const slots = round.matches.map((match) => (
          <div className="bracket-slot" key={match.id}>
            <BracketMatch match={match} />
          </div>
        ));
        const groups = [];

        if (paired) {
          for (let i = 0; i < slots.length; i += 2) {
            groups.push(
              <div className="bracket-pair" key={round.matches[i].id}>
                {slots.slice(i, i + 2)}
              </div>,
            );
          }
        }

        return (
          <div className={`bracket-round bracket-round-${connector}`} key={round.title}>
            <h4 className="bracket-round-title">{round.title}</h4>
            <div className="bracket-round-matches">{paired ? groups : slots}</div>
          </div>
        );
      })}
    </div>
  );
}

function Bracket({ upper = [], lower = [], grandFinal, label = "Chaveamento do campeonato" }) {
  return (
    <section className="bracket" aria-label={label}>
      <div className="bracket-scroll">
        <div className="bracket-side">
          <div className="bracket-branch">
            <span className="bracket-branch-title bracket-branch-upper">Upper Bracket</span>
            <BracketRounds rounds={upper} />
          </div>
          {lower.length > 0 && (
            <div className="bracket-branch">
              <span className="bracket-branch-title bracket-branch-lower">Lower Bracket</span>
              <BracketRounds rounds={lower} />
            </div>
          )}
        </div>
        {grandFinal && (
          <div className="bracket-final">
            <h4 className="bracket-round-title">Grande final</h4>
            <BracketMatch match={grandFinal} />
          </div>
        )}
      </div>
    </section>
  );
}

export default Bracket;
