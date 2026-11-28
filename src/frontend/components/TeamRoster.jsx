import { useId } from "react";
import CountryFlag from "./CountryFlag.jsx";

function RosterGroup({ title, members }) {
  const headingId = useId();

  if (members.length === 0) return null;

  return (
    <section className="roster-group" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      <ul className="roster-grid">
        {members.map((member) => (
          <li className="roster-card" key={member.id}>
            <div className="roster-avatar" aria-hidden="true">
              {member.imageUrl ? (
                <img src={member.imageUrl} alt="" />
              ) : (
                <span>{member.name.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="roster-info">
              <div className="roster-name">
                <strong>{member.name}</strong>
                <CountryFlag countryCode={member.countryCode} countryName={member.countryName} />
              </div>
              {member.fullName && <span>{member.fullName}</span>}
              {member.role && <span className="roster-role">{member.role}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamRoster({ players = [], staff = [] }) {
  if (players.length === 0 && staff.length === 0) {
    return <p className="roster-empty">Elenco ainda não disponível.</p>;
  }

  return (
    <div className="team-roster">
      <RosterGroup title="Jogadores" members={players} />
      <RosterGroup title="Staff" members={staff} />
    </div>
  );
}

export default TeamRoster;
