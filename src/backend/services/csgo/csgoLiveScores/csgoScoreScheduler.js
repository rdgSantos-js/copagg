// ------------------------------------------------------------------------------------------
// Agenda sincronizações de partidas e catálogos permitidos no plano Free da PandaScore.
// ------------------------------------------------------------------------------------------




import { pandascore } from "../../../integrations/pandascore/client.js";
import { getDatabase } from "../../../db/database.js";
import { syncCsgoCatalog } from "../csgoCatalogSync.js";
import { syncCsgoMatches } from "./csgoLiveScoreSync.js";

const RUNNING_INTERVAL_MS = 30_000;
const UPCOMING_INTERVAL_MS = 5 * 60_000;
const PAST_INTERVAL_MS = 60 * 60_000;
const CATALOG_INTERVAL_MS = 24 * 60 * 60_000;
let stopActiveScheduler;

// Agenda jobs independentes e inicia cada um com um pequeno intervalo.
export function startCsgoScoreScheduler({
  client = pandascore,
  db = getDatabase(),
  runningIntervalMs = RUNNING_INTERVAL_MS,
  upcomingIntervalMs = UPCOMING_INTERVAL_MS,
  pastIntervalMs = PAST_INTERVAL_MS,
  catalogIntervalMs = CATALOG_INTERVAL_MS,
  logger = console,
} = {}) {
  if (stopActiveScheduler) {
    return stopActiveScheduler;
  }

  let stopped = false;
  const timers = new Set();
  const jobs = [
    {
      name: "running matches",
      initialDelayMs: 0,
      intervalMs: runningIntervalMs,
      run: () => syncCsgoMatches({ client, db, state: "running" }),
    },
    {
      name: "upcoming matches",
      initialDelayMs: 5_000,
      intervalMs: upcomingIntervalMs,
      run: () => syncCsgoMatches({ client, db, state: "upcoming" }),
    },
    {
      name: "past matches (30-day window)",
      initialDelayMs: 10_000,
      intervalMs: pastIntervalMs,
      run: () => syncCsgoMatches({ client, db, state: "past" }),
    },
    {
      name: "videogame, league, series, and tournament catalogs",
      initialDelayMs: 15_000,
      intervalMs: catalogIntervalMs,
      run: () => syncCsgoCatalog({ client, db }),
    },
  ];

  // Cancela os temporizadores para impedir novas sincronizações.
  const stop = () => {
    stopped = true;
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
    stopActiveScheduler = undefined;
  };

  // Executa um job e o agenda novamente após terminar, sem sobrepor a si próprio.
  async function runJob(job) {
    try {
      const result = await job.run();
      const count = Array.isArray(result)
        ? result.reduce((sum, item) => sum + item.total, 0)
        : result.matches?.length ?? 0;
      logger.info(`Updated ${count} records for ${job.name}.`);
    } catch (error) {
      logger.error(
        `Counter-Strike ${job.name} sync failed:`,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      if (!stopped) {
        schedule(job, job.intervalMs);
      }
    }
  }

  function schedule(job, delayMs) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      void runJob(job);
    }, delayMs);
    timers.add(timer);
  }

  stopActiveScheduler = stop;
  for (const job of jobs) {
    schedule(job, job.initialDelayMs);
  }

  return stop;
}
