/**
 * Finagra Unity — WatermelonDB Delta-Sync Manager
 *
 * Protocol:
 *   1. Pull: GET /api/v1/sync/pull?since=<last_pulled_at>
 *   2. Push: POST /api/v1/sync/push (offline mutations)
 *   3. Conflict: server timestamp wins (see conflictResolver.js)
 *
 * Offline-first guarantee:
 *   - All mutations go to WatermelonDB immediately (optimistic)
 *   - SyncQueue stores pending mutations for retry
 *   - On reconnect, push is atomic (all-or-nothing per batch)
 */

import { synchronize } from '@nozbe/watermelondb/sync'
import NetInfo from '@react-native-community/netinfo'
import { resolveConflict, sanitizePushRecord } from './conflictResolver'

const API_BASE = process.env.API_BASE_URL || 'http://localhost:8888/api/v1'

// In-memory flag — prevents concurrent syncs
let syncInProgress = false

/**
 * syncDatabase triggers a full WatermelonDB delta-sync cycle.
 * Safe to call anytime — debounces concurrent calls automatically.
 *
 * @param {Database} database - WatermelonDB database instance
 * @returns {Promise<{pulled: number, pushed: number}>} sync stats
 */
export async function syncDatabase(database) {
  if (syncInProgress) {
    console.log('[Sync] Already in progress — skipping')
    return { pulled: 0, pushed: 0 }
  }

  const netState = await NetInfo.fetch()
  if (!netState.isConnected) {
    console.log('[Sync] Offline — queuing for later')
    return { pulled: 0, pushed: 0 }
  }

  syncInProgress = true
  const startMs = Date.now()

  try {
    let pulledCount = 0
    let pushedCount = 0

    await synchronize({
      database,

      // ── PULL: fetch server changes since last sync ─────────────
      pullChanges: async ({ lastPulledAt }) => {
        const since = lastPulledAt ?? 0
        const url = `${API_BASE}/sync/pull?since=${since}`

        const resp = await fetchWithRetry(url, { method: 'GET' })
        if (!resp.ok) {
          throw new Error(`Pull failed: ${resp.status} ${await resp.text()}`)
        }

        const data = await resp.json()
        pulledCount = countChanges(data.changes)

        console.log(`[Sync] Pull: ${pulledCount} records (since=${since})`)
        return {
          changes:   data.changes,
          timestamp: data.timestamp,
        }
      },

      // ── PUSH: send offline mutations to server ─────────────────
      pushChanges: async ({ changes, lastPulledAt }) => {
        const hasChanges = hasAnyChanges(changes)
        if (!hasChanges) return

        const payload = {
          last_pulled_at: lastPulledAt ?? 0,
          changes: sanitizeChanges(changes),
        }

        const resp = await fetchWithRetry(`${API_BASE}/sync/push`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        })

        if (!resp.ok) {
          const err = await resp.text()
          throw new Error(`Push failed: ${resp.status} ${err}`)
        }

        const result = await resp.json()
        pushedCount = countPushChanges(changes)

        // Reconcile local→server ID mappings returned by the server
        if (result.server_ids) {
          await reconcileServerIDs(database, result.server_ids)
        }

        console.log(`[Sync] Push: ${pushedCount} records, conflicts_resolved=${result.stats?.conflicts_resolved_server_wins ?? 0}`)
      },

      // ── CONFLICT RESOLUTION ────────────────────────────────────
      conflictResolver: resolveConflict,

      // Migrations: bump schema version here when schema changes
      migrationsEnabledAtVersion: 1,
    })

    const durationMs = Date.now() - startMs
    console.log(`[Sync] Complete in ${durationMs}ms — pulled=${pulledCount} pushed=${pushedCount}`)
    return { pulled: pulledCount, pushed: pushedCount }

  } catch (err) {
    console.error('[Sync] Failed:', err.message)
    throw err
  } finally {
    syncInProgress = false
  }
}

/**
 * watchAndSync sets up a network state listener that triggers sync
 * automatically when connectivity is restored after being offline.
 * Returns an unsubscribe function.
 */
export function watchAndSync(database) {
  let wasOffline = false

  const unsubscribe = NetInfo.addEventListener(state => {
    if (!state.isConnected) {
      wasOffline = true
      console.log('[Sync] Went offline — mutations will queue locally')
    } else if (wasOffline && state.isConnected) {
      wasOffline = false
      console.log('[Sync] Reconnected — triggering delta-sync')
      syncDatabase(database).catch(console.error)
    }
  })

  return unsubscribe
}

// ─── helpers ─────────────────────────────────────────────────────────

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) })
      return resp
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 500)) // exp backoff
    }
  }
}

function hasAnyChanges(changes) {
  for (const table of Object.values(changes ?? {})) {
    if (table.created?.length || table.updated?.length || table.deleted?.length) {
      return true
    }
  }
  return false
}

function countChanges(changes) {
  return Object.values(changes ?? {}).reduce((sum, t) => {
    return sum + (t.created?.length ?? 0) + (t.updated?.length ?? 0) + (t.deleted?.length ?? 0)
  }, 0)
}

function countPushChanges(changes) {
  return countChanges(changes)
}

function sanitizeChanges(changes) {
  const out = {}
  for (const [table, ops] of Object.entries(changes ?? {})) {
    if (table === 'transactions') continue // never push transactions
    out[table] = {
      created: (ops.created ?? []).map(sanitizePushRecord),
      updated: (ops.updated ?? []).map(sanitizePushRecord),
      deleted: ops.deleted ?? [],
    }
  }
  return out
}

/**
 * reconcileServerIDs updates local WatermelonDB records with the server UUIDs
 * returned after a successful push. This maps localID → serverID so future
 * updates reference the correct server record.
 */
async function reconcileServerIDs(database, serverIDs) {
  await database.write(async () => {
    for (const [tableName, idMap] of Object.entries(serverIDs)) {
      const collection = database.get(tableName)
      for (const [localID, serverUUID] of Object.entries(idMap)) {
        try {
          const record = await collection.find(localID)
          await record.update(r => { r.serverId = serverUUID })
        } catch {
          // Record may have already been reconciled — skip
        }
      }
    }
  })
}
