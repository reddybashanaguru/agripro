/**
 * WatermelonDB schema migrations.
 * Add new migration objects here when the schema version bumps.
 * Never modify existing migrations — always add a new step.
 */

import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations'

export const migrations = schemaMigrations({
  migrations: [
    // v1 → initial schema (no migration needed, handled by fresh install)
  ],
})
