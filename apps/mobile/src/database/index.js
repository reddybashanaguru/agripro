/**
 * Finagra Unity — WatermelonDB Database Initialization
 * Uses SQLite adapter for React Native (AsyncStorage on web)
 */

import { Database }         from '@nozbe/watermelondb'
import SQLiteAdapter        from '@nozbe/watermelondb/adapters/sqlite'
import { finagraSchema }    from '../../watermelon/schema'
import { migrations }       from '../../watermelon/migrations'
import Farmer               from '../models/Farmer'
import LandPlot             from '../models/LandPlot'
import Transaction          from '../models/Transaction'

const adapter = new SQLiteAdapter({
  schema: finagraSchema,
  migrations,
  dbName: 'finagra_unity',
  jsi: true,               // use JSI for 10x faster SQLite on RN 0.71+
  onSetUpError: error => {
    // In production: report to Sentry, prompt user to reinstall
    console.error('[DB] Setup failed:', error)
  },
})

export const database = new Database({
  adapter,
  modelClasses: [Farmer, LandPlot, Transaction],
})

export { Farmer, LandPlot, Transaction }
