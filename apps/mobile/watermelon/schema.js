// Finagra Unity — WatermelonDB Offline-First Schema
// Conflict resolution: last_synced_at (server timestamp wins if newer)
// All IDs: string (maps to UUID on server)

import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const finagraSchema = appSchema({
  version: 1,
  tables: [

    // ── FARMERS ──────────────────────────────────────────────────
    tableSchema({
      name: 'farmers',
      columns: [
        { name: 'server_id',      type: 'string',  isOptional: true },  // maps to UUID PK
        { name: 'phone',          type: 'string'  },
        { name: 'name',           type: 'string'  },
        { name: 'kyc_status',     type: 'string'  },  // PENDING|VERIFIED|REJECTED
        { name: 'fpo_id',         type: 'string',  isOptional: true },
        { name: 'is_deleted',     type: 'boolean', isOptional: true },
        // Sync metadata — DO NOT rename these columns
        { name: 'created_at',     type: 'number'  },  // unix ms
        { name: 'updated_at',     type: 'number'  },  // unix ms
        { name: 'last_synced_at', type: 'number',  isOptional: true },  // unix ms from server
      ],
    }),

    // ── LAND PLOTS ────────────────────────────────────────────────
    tableSchema({
      name: 'land_plots',
      columns: [
        { name: 'server_id',      type: 'string',  isOptional: true },
        { name: 'farmer_id',      type: 'string'  },  // WatermelonDB local ID
        { name: 'farmer_server_id', type: 'string', isOptional: true },
        { name: 'plot_name',      type: 'string',  isOptional: true },
        // GeoJSON polygon stored as serialized string — PostGIS GEOMETRY on server
        { name: 'geom_json',      type: 'string'  },
        { name: 'area_acres',     type: 'number',  isOptional: true },
        { name: 'soil_type',      type: 'string',  isOptional: true },
        { name: 'survey_number',  type: 'string',  isOptional: true },
        { name: 'district',       type: 'string',  isOptional: true },
        { name: 'state',          type: 'string',  isOptional: true },
        { name: 'is_deleted',     type: 'boolean', isOptional: true },
        { name: 'created_at',     type: 'number'  },
        { name: 'updated_at',     type: 'number'  },
        { name: 'last_synced_at', type: 'number',  isOptional: true },
      ],
    }),

    // ── TRANSACTIONS (read-only on mobile — created by server) ────
    tableSchema({
      name: 'transactions',
      columns: [
        { name: 'server_id',      type: 'string'  },
        { name: 'farmer_id',      type: 'string'  },
        { name: 'gross_amount',   type: 'string'  },  // decimal string — never number
        { name: 'currency',       type: 'string'  },
        { name: 'status',         type: 'string'  },
        { name: 'description',    type: 'string',  isOptional: true },
        { name: 'completed_at',   type: 'number',  isOptional: true },
        { name: 'created_at',     type: 'number'  },
        { name: 'updated_at',     type: 'number'  },
        { name: 'last_synced_at', type: 'number',  isOptional: true },
      ],
    }),

    // ── SYNC QUEUE (pending mutations created offline) ────────────
    tableSchema({
      name: 'sync_queue',
      columns: [
        { name: 'table_name',     type: 'string'  },
        { name: 'record_id',      type: 'string'  },  // local WatermelonDB ID
        { name: 'server_id',      type: 'string',  isOptional: true },
        { name: 'operation',      type: 'string'  },  // INSERT|UPDATE|DELETE
        { name: 'payload',        type: 'string'  },  // JSON
        { name: 'retry_count',    type: 'number'  },
        { name: 'last_error',     type: 'string',  isOptional: true },
        { name: 'created_at',     type: 'number'  },
      ],
    }),
  ],
})

// ─────────────────────────────────────────────────────────────────
// SYNC STRATEGY: last_synced_at conflict resolution
//
// Pull:  GET /api/v1/sync/pull?since=<last_synced_at>
//        Server returns records WHERE last_synced_at > since
//        Client upserts: if server.updated_at > local.updated_at → server wins
//
// Push:  POST /api/v1/sync/push { changes: { farmers: {created,updated,deleted} } }
//        Server applies, returns canonical server IDs
//        Client maps local IDs → server IDs in sync_queue
//
// Conflict Rule:
//   - Offline edit vs server edit → server timestamp (last_synced_at) wins
//   - Financial records (transactions) are read-only on mobile — never editable offline
// ─────────────────────────────────────────────────────────────────
