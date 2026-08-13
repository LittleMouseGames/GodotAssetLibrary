#!/usr/bin/env node
/**
 * Minimal, dependency-free origin load harness for Phase 7 capacity drills.
 *
 * Usage:
 *   node scripts/loadtest.js \
 *     --url http://localhost:8080 \
 *     --paths '/,/search/,/asset/abc-123' \
 *     --concurrency 50 \
 *     --duration 15
 *
 * Fires random-path GETs from `concurrency` parallel workers for `duration`
 * seconds, then prints throughput, latency percentiles and the status
 * distribution. Run warm (repeat paths), cold (unique paths) and abuse
 * (random high-cardinality paths) profiles against one worker first, then the
 * configured cluster.
 */
const http = require('http')
const https = require('https')

function parseArg (name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1 || process.argv[index + 1] === undefined) return fallback
  return process.argv[index + 1]
}

const baseUrl = parseArg('url', 'http://localhost:8080')
const paths = parseArg('paths', '/').split(',').filter(Boolean).map(p => p.trim())
const concurrency = Number.parseInt(parseArg('concurrency', '20'), 10)
const durationSec = Number.parseInt(parseArg('duration', '10'), 10)
const url = new URL(baseUrl)

const transport = url.protocol === 'https:' ? https : http
const latencies = []
const statusCounts = new Map()
let completed = 0
let errors = 0
const start = Date.now()

function request (workerId) {
  const path = paths[Math.floor(Math.random() * paths.length)]
  const reqStart = Date.now()
  const req = transport.get({
    hostname: url.hostname,
    port: url.port,
    path,
    headers: { 'user-agent': 'godot-loadtest' }
  }, (res) => {
    res.resume()
    res.on('end', () => {
      completed++
      latencies.push(Date.now() - reqStart)
      statusCounts.set(res.statusCode, (statusCounts.get(res.statusCode) ?? 0) + 1)
      next(workerId)
    })
  })
  req.on('error', () => {
    errors++
    completed++
    next(workerId)
  })
}

function next (workerId) {
  if (Date.now() - start >= durationSec * 1000) return
  request(workerId)
}

// Start the workers.
for (let i = 0; i < concurrency; i++) request(i)

// Wait for the window, then report.
setTimeout(() => {
  const elapsedSec = (Date.now() - start) / 1000
  const sorted = [...latencies].sort((a, b) => a - b)
  const pct = (p) => sorted.length > 0 ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0
  const total = completed
  const rps = total / elapsedSec
  console.log('--- loadtest results ---')
  console.log(`target: ${baseUrl}  paths: [${paths.join(', ')}]`)
  console.log(`concurrency: ${concurrency}  duration: ${durationSec}s`)
  console.log(`completed: ${total}  errors: ${errors}  elapsed: ${elapsedSec.toFixed(1)}s  rps: ${rps.toFixed(1)}`)
  console.log(`latency p50: ${pct(0.5)}ms  p95: ${pct(0.95)}ms  p99: ${pct(0.99)}ms  max: ${pct(1)}ms`)
  console.log(`status: ${JSON.stringify(Object.fromEntries(statusCounts))}`)
  process.exit(0)
}, durationSec * 1000 + 500)
