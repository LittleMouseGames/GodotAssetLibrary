import os from 'os'

const MAX_WORKERS = 16

/**
 * Worst-case TOTAL MongoDB connection budget across every process in the
 * cluster (HTTP workers + primary). Per-process ceilings are derived from this
 * budget so the aggregate can never exceed it, no matter how many workers run.
 */
export const DEFAULT_TOTAL_POOL_BUDGET = 1500

/**
 * How many HTTP worker processes the cluster should run.
 *
 * Set WORKER_COUNT explicitly (e.g. to your container's CPU allocation); the
 * default is the visible CPU count, capped so a small container on a big host
 * doesn't oversubscribe. Each worker is its own Node process, so this is what
 * actually lets the app "use the most it can" across cores instead of being
 * limited to the single thread of one process.
 */
export function getWorkerCount (): number {
  const parsed = Number.parseInt(process.env.WORKER_COUNT ?? '', 10)
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, MAX_WORKERS)
  }
  return Math.min(Math.max(1, os.cpus().length), MAX_WORKERS)
}

/**
 * Default per-process MongoDB pool ceiling for HTTP workers.
 *
 * Every cluster worker AND the primary owns its own MongoClient, so the
 * per-worker ceiling is the total budget divided by the process count (workers
 * + primary) using floor() so the aggregate NEVER exceeds the budget — even at
 * 16 workers (~88/process) instead of the old 200-per-process floor that
 * allowed up to ~3400 total connections. The pool is lazy (a ceiling, not a
 * target), and an explicit MONGO_MAX_POOL env override always wins.
 */
export function getDefaultMongoPool (): number {
  const workerCount = getWorkerCount()
  return Math.max(64, Math.floor(DEFAULT_TOTAL_POOL_BUDGET / (workerCount + 1)))
}

/**
 * Mongo pool ceiling for the cluster PRIMARY (bootstrap + cron only, no HTTP).
 * It never serves requests, so it needs far fewer connections than a worker;
 * keeping it small leaves more of the budget for the workers that actually
 * handle traffic.
 */
export function getPrimaryMongoPool (): number {
  const workerCount = getWorkerCount()
  return Math.max(16, Math.floor(DEFAULT_TOTAL_POOL_BUDGET / (workerCount + 1) / 4))
}
