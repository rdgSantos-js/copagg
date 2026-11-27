# PandaScore Live Scores

Read-only Counter-Strike API. The service synchronizes PandaScore data to SQLite and serves local routes without making an upstream request for each user request.

## Database model

Competition data is stored relationally using the PandaScore hierarchy:
`leagues -> series -> tournaments -> matches -> games`. Teams and their scores are
stored in `teams`, `match_teams`, and `game_teams`. In Counter-Strike, individual
`games` represent maps within a match. The legacy `csgo_live_matches` table is no longer
used.

## Configuration

Create a `.env` file in the project root:

```env
PANDASCORE_TOKEN=your_pandascore_token
PORT=3000
```

Keep `.env` private; it is excluded by `.gitignore`.

## Run

```bash
npm run dev
```

The server hydrates the live-score cache from SQLite, then synchronizes:

- Running matches every 30 seconds.
- Upcoming matches every 5 minutes.
- Past matches from the last 30 days every hour.
- Leagues, series, and upcoming tournaments every 24 hours.

The SQLite database is stored under the ignored `data/` directory. Synchronization
failures are logged and do not replace the last successful data.

## Endpoint

```text
GET /api/csgo/live-scores
```

The response contains the running matches, each team's current score, the last successful refresh time, and an `isStale` flag. This endpoint reads from the local cache and does not call PandaScore.

The scheduler requests up to 100 matches per page. One page of running matches every
30 seconds is approximately 120 PandaScore calls per hour. Upcoming/past pages and
catalog pagination add calls, so monitor the request logs and leave room for retries
within the Free plan's hourly quota.

## Local catalog routes

All routes below read only from SQLite. They never call restricted match-detail or
game endpoints at PandaScore; a detail or game is available only if it was included
in a response already synchronized from an endpoint available on the Free plan.

| Route | Description |
| --- | --- |
| `GET /api/csgo/leagues[?page=1&per_page=50&search=...]` | List synchronized leagues |
| `GET /api/csgo/leagues/:id` | Read a league |
| `GET /api/csgo/leagues/:id/series` | List a league's series |
| `GET /api/csgo/leagues/:id/matches` | List matches linked to a league |
| `GET /api/csgo/series[?page=1&per_page=50&search=...]` | List synchronized series |
| `GET /api/csgo/series/:id` | Read a series |
| `GET /api/csgo/series/:id/tournaments` | List a series' tournaments |
| `GET /api/csgo/series/:id/matches` | List matches linked to a series |
| `GET /api/csgo/tournaments` | List synchronized tournaments |
| `GET /api/csgo/tournaments/upcoming` | List upcoming tournaments |
| `GET /api/csgo/tournaments/:id` | Read a tournament |
| `GET /api/csgo/tournaments/:id/matches` | List matches linked to a tournament |
| `GET /api/csgo/matches?state=upcoming\|running\|past` | List matches, optionally by state |
| `GET /api/csgo/matches/upcoming\|running\|past` | List matches by state |
| `GET /api/csgo/matches/:id` | Read a locally synchronized match |
| `GET /api/csgo/matches/:id/games` | List games/maps included in the match data |
| `GET /api/csgo/games/:id` | Read a locally synchronized game/map |
| `GET /api/csgo/live-scores` | Read cached running scores |

Collection routes support `page` (or `page[number]`) and `per_page` (or
`page[size]`), with a maximum page size of 100. League, series, and tournament lists
also support `search` by name or slug. Responses include `data` and `pagination`
for lists. Past matches are restricted to the last 30 days.

## Error records

PandaScore HTTP, network, timeout, and invalid-response errors are stored in the `api_error_logs` SQLite table. Records include the endpoint, page, category, HTTP status, safe error code, and sanitized message. Tokens, request headers, and raw response bodies are not stored. Logs older than 30 days are removed at startup and when a new error is recorded. If SQLite cannot save an error, the failure is reported in the server log and the original sync error is preserved.

## Request records

Every request sent through the shared PandaScore Axios client is recorded in the
`api_request_logs` SQLite table, including successful responses and failures. Records
contain timestamps, method, endpoint, page, HTTP status, duration, outcome, and a safe
error code. Credentials, headers, and request/response bodies are not stored. Records
older than 30 days are removed at startup and during request logging.

## Tests

The default test run uses only local fixtures and mocks; it does not call PandaScore.

```bash
npm test
```

To also run a real API integration test, set `PANDASCORE_USE_REAL_API=true` in `.env`
and run `npm test` again. The test requires `PANDASCORE_TOKEN` and makes one authenticated,
read-only request for at most one running Counter-Strike match. This consumes one API call.
Remove the toggle or set it to `false` to disable the real API test.
