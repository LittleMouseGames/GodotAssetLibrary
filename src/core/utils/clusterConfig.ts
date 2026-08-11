import os from 'os'

const MAX_WORKERS = 16

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
 * Default per-process MongoDB pool ceiling.
 *
 * Every cluster worker (and the primary) owns its own MongoClient, so this
 * sizes each pool so the TOTAL worst-case connections stay bounded regardless
 * of cluster size (~1500 across the whole cluster): 1 worker -> 1500, 2 ->
 * 750 each, 4 -> 375 each, etc. This keeps MongoDB from being hit with
 * `workers x 1500` connections by accident. An explicit MONGO_MAX_POOL env
 * override always wins.
 */
export function getDefaultMongoPool (): number {
  const workerCount = getWorkerCount()
  return Math.max(200, Math.round(1500 / workerCount))
}
