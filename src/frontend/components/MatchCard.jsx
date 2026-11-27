import Icon from "./Icon.jsx";

function MatchCard({ match }) {
  return (
    <article className="match-card">
      <div className="match-card-top">
        <span className={`status-badge status-${match.statusType}`}>
          {match.statusType === "live" && <span className="live-dot" />}
          {match.status}
        </span>
        <span className="match-time">{match.time}</span>
      </div>
      <p className="match-competition">{match.competition}</p>
      <div className="match-teams">
        {match.teams.map((team) => (
          <div className="match-team" key={team.name}>
            <span className={`team-mark team-mark-${team.abbreviation.toLowerCase()}`}>
              {team.abbreviation.slice(0, 1)}
            </span>
            <span className="team-name">{team.name}</span>
            <strong className="team-score">
              {team.score === null ? "—" : team.score}
            </strong>
          </div>
        ))}
      </div>
      <div className="match-card-footer">
        <span>{match.statusType === "live" ? "Counter-Strike 2" : "Melhor de 3"}</span>
        <button className="icon-button" type="button" aria-label="Ver partida">
          <Icon name="arrow" />
        </button>
      </div>
    </article>
  );
}

export default MatchCard;
