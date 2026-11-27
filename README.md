# PandaScore Live Scores

Read-only live-score API. The service polls PandaScore, persists the latest running matches in SQLite, and serves requests from an in-memory cache hydrated from SQLite.

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

The server hydrates its cache from SQLite, performs an initial PandaScore sync, then refreshes approximately every 30 seconds. The SQLite database is stored under the ignored `data/` directory.

## Endpoint

```text
GET /api/csgo/live-scores
```

The response contains the running matches, each team's current score, the last successful refresh time, and an `isStale` flag. This endpoint reads from the local cache and does not call PandaScore.

The scheduler polls `GET /csgo/matches/running` with up to 100 matches per page. One page every 30 seconds is approximately 120 PandaScore calls per hour; additional pages and retries consume more of the hourly quota.

## Error records

PandaScore HTTP, network, timeout, and invalid-response errors are stored in the `api_error_logs` SQLite table. Records include the endpoint, page, category, HTTP status, safe error code, and sanitized message. Tokens, request headers, and raw response bodies are not stored. Logs older than 30 days are removed at startup and when a new error is recorded. If SQLite cannot save an error, the failure is reported in the server log and the original sync error is preserved.

## Tests

The default test run uses only local fixtures and mocks; it does not call PandaScore.

```bash
npm test
```

To also run a real API integration test, set `PANDASCORE_USE_REAL_API=true` in `.env`
and run `npm test` again. The test requires `PANDASCORE_TOKEN` and makes one authenticated,
read-only request for at most one running Counter-Strike match. This consumes one API call.
Remove the toggle or set it to `false` to disable the real API test.
