import HorizontalMatchCard from "./HorizontalMatchCard.jsx";

function HorizontalMatchList({ matches }) {
  return (
    <div className="horizontal-match-list">
      {matches.map((match) => (
        <HorizontalMatchCard
          key={`${match.competition}-${match.teams[0].name}-${match.teams[1].name}`}
          match={match}
        />
      ))}
    </div>
  );
}

export default HorizontalMatchList;
