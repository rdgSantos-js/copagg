function HorizontalMatchCard({ match }) {
  const [teamA, teamB] = match.teams;
  const scoreIsMissing = teamA.score === null || teamB.score === null;
  const matchInfo = match.statusType === "live"
    ? match.competition
    : [match.date, match.time].filter(Boolean).join(" · ");

  return (
    <article className="match-card horizontal-match-item">
      <span className={`status-badge status-${match.statusType}`}>
        {match.statusType === "live" && <span className="live-dot" />}
        {match.status}
      </span>
      <div className="horizontal-match-teams">
        <div className="horizontal-match-team">
          <span
            className={`team-mark team-mark-${teamA.abbreviation.toLowerCase()}`}
            aria-hidden="true"
          >
            {teamA.abbreviation.slice(0, 1)}
          </span>
          <span className="horizontal-match-team-name">{teamA.name}</span>
        </div>
        <div
          className={`horizontal-match-score ${scoreIsMissing ? "horizontal-match-score-hidden" : ""}`}
        >
          <strong>{teamA.score ?? "—"}</strong>
          <span aria-hidden="true">–</span>
          <strong>{teamB.score ?? "—"}</strong>
        </div>
        <div className="horizontal-match-team">
          <span className="horizontal-match-team-name">{teamB.name}</span>
          <span
            className={`team-mark team-mark-${teamB.abbreviation.toLowerCase()}`}
            aria-hidden="true"
          >
            {teamB.abbreviation.slice(0, 1)}
          </span>
        </div>
      </div>
      <span className="horizontal-match-info">{matchInfo}</span>
    </article>
  );
}

export default HorizontalMatchCard;
