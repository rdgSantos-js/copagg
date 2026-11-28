function BracketTeam({ team }) {
  if (!team) {
    return (
      <div className="bracket-team bracket-team-empty">
        <span className="team-mark">?</span>
        <span className="team-name">A definir</span>
      </div>
    );
  }

  return (
    <div className={`bracket-team${team.winner ? " bracket-team-winner" : ""}`}>
      <span className={`team-mark team-mark-${team.abbreviation.toLowerCase()}`}>
        {team.abbreviation.slice(0, 1)}
      </span>
      <span className="team-name">{team.name}</span>
      <strong className="team-score">{team.score ?? "–"}</strong>
    </div>
  );
}

function BracketMatch({ match }) {
  const [first, second] = match.teams;

  return (
    <article className={`bracket-match${match.live ? " bracket-match-live" : ""}`}>
      {match.label && <span className="bracket-match-label">{match.label}</span>}
      <BracketTeam team={first} />
      <BracketTeam team={second} />
    </article>
  );
}

export default BracketMatch;
