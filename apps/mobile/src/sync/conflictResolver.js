/**
 * Finagra Unity — WatermelonDB Conflict Resolver
 *
 * Resolution policy: SERVER WINS on timestamp conflict.
 * Rationale: Financial records require a single source of truth.
 *            The server has the authoritative data (verified by LogicAuditor).
 *
 * Exception: If the local record was created offline (no server_id yet),
 *            treat it as a new record — never discard unpushed data.
 */

/**
 * resolveConflict is called by WatermelonDB synchronize() when the same
 * record was modified both locally and on the server since last sync.
 *
 * @param {string} tableName
 * @param {Object} local  - Local WatermelonDB record (raw)
 * @param {Object} remote - Server record from pull response
 * @returns {Object} - The resolved record to save locally
 */
export function resolveConflict(tableName, local, remote) {
  // If local record has no server_id, it was created fully offline.
  // These are handled by the push flow — never discard them here.
  if (!local.server_id && !remote.id) {
    return local
  }

  const localUpdatedAt  = local.updated_at  || 0
  const remoteUpdatedAt = remote.updated_at || 0

  // Financial records (transactions) are always server-authoritative
  if (tableName === 'transactions') {
    return { ...local, ...remote, last_synced_at: Date.now() }
  }

  // Server wins if server record is newer or equal (tie-break to server)
  if (remoteUpdatedAt >= localUpdatedAt) {
    return {
      ...local,          // preserve WatermelonDB internal fields
      ...remote,         // overwrite with server data
      last_synced_at: Date.now(),
    }
  }

  // Client is genuinely newer — keep local, but update sync marker
  return {
    ...local,
    last_synced_at: Date.now(),
  }
}

/**
 * sanitizePushRecord strips WatermelonDB internal fields before sending to server.
 * The server doesn't know about _changed, _status, etc.
 */
export function sanitizePushRecord(record) {
  const { _changed, _status, ...clean } = record
  return clean
}
