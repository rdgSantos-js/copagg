import SmallMatchCard from "./SmallMatchCard.jsx";

function MatchColumn({ matches }) {
  return (
    <div className="match-column">
      {matches.map((match) => (
        <SmallMatchCard key={match.competition} match={match} />
      ))}
    </div>
  );
}

export default MatchColumn;
