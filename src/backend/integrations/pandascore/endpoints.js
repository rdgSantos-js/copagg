// ------------------------------------------------------------------------------------------
// Centraliza os caminhos dos endpoints da PandaScore usados pela aplicação.
// ------------------------------------------------------------------------------------------




// Reúne os endpoints de Counter-Strike para evitar caminhos duplicados no código.
export const PANDASCORE_ENDPOINTS = Object.freeze({
  videogames: "/videogames",
  csgo: Object.freeze({
    leagues: "/csgo/leagues",
    series: "/csgo/series",
    upcomingTournaments: "/csgo/tournaments/upcoming",
    upcomingMatches: "/csgo/matches/upcoming",
    runningMatches: "/csgo/matches/running",
    pastMatches: "/csgo/matches/past",
  }),
});
