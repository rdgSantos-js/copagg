function SmallMatchCard({ match }) {
  const hasMissingScore = match.teams.some((team) => team.score === null);

  return (
    <article className="match-card">
      <div className={`match-teams ${hasMissingScore ? "match-teams-with-date" : ""}`}>
        {match.teams.map((team) => (
          <div className="match-team" key={team.name}>
            <span className={`team-mark team-mark-${team.abbreviation.toLowerCase()}`}>
              {team.abbreviation.slice(0, 1)}
            </span>
            <span className="team-name">{team.name}</span>
            {team.score !== null && <strong className="team-score">{team.score}</strong>}
          </div>
        ))}
        {hasMissingScore && (
          <div className="match-date-time">
            <span>{match.date}</span>
            <span>{match.time}</span>
          </div>
        )}
      </div>
    </article>
  );
}

export default SmallMatchCard;
