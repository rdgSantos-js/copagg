const defaultColumns = [
  { key: "wins", label: "V", title: "Vitórias" },
  { key: "losses", label: "D", title: "Derrotas" },
];

function getStandingsValue(entry, key) {
  const value = Object.prototype.hasOwnProperty.call(entry, key) ? entry[key] : undefined;
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
    return value;
  }
  throw new TypeError(`Valor inválido na coluna "${key}" da classificação.`);
}

function Standings({ standings, columns = defaultColumns }) {
  if (standings.length === 0) {
    return <p className="standings-empty">Classificação ainda não disponível.</p>;
  }

  return (
    <table className="standings-table" aria-label="Classificação">
      <thead>
        <tr>
          <th scope="col">Equipe</th>
          {columns.map(({ key, label, title }) => (
            <th scope="col" key={key}>
              {title ? <abbr title={title}>{label}</abbr> : label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {standings.map((entry) => (
          <tr key={entry.team.id}>
            <th scope="row">
              <span className="standings-team">
                <span className={`team-mark team-mark-${entry.team.abbreviation.toLowerCase()}`}>
                  {entry.team.abbreviation.slice(0, 1)}
                </span>
                <span>{entry.team.name}</span>
              </span>
            </th>
            {columns.map(({ key, bold }) => (
              <td className={bold === true ? "standings-cell-bold" : undefined} key={key}>
                {getStandingsValue(entry, key)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default Standings;
