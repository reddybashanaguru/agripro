import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'

// Transactions are READ-ONLY on mobile — created only by the Go backend.
// Never pushed from mobile. Only pulled for display.
export default class Transaction extends Model {
  static table = 'transactions'

  @field('server_id')    serverId
  @field('farmer_id')    farmerId
  @field('gross_amount') grossAmount   // decimal string — never Number
  @field('currency')     currency
  @field('status')       status
  @field('description')  description

  @readonly @date('created_at')  createdAt
  @date('updated_at')            updatedAt
  @date('last_synced_at')        lastSyncedAt

  get isPending()   { return this.status === 'PENDING' }
  get isCompleted() { return this.status === 'COMPLETED' }
  get isFailed()    { return this.status === 'FAILED' }

  // Split display helpers (50/25/5/20 — mirrors backend Math Laws)
  get farmerAmount() {
    const g = parseFloat(this.grossAmount)
    return isNaN(g) ? '0.00' : (g * 0.50).toFixed(2)
  }
  get platformAmount() {
    const g = parseFloat(this.grossAmount)
    return isNaN(g) ? '0.00' : (g * 0.25).toFixed(2)
  }
  get agentAmount() {
    const g = parseFloat(this.grossAmount)
    return isNaN(g) ? '0.00' : (g * 0.05).toFixed(2)
  }
  get reserveAmount() {
    const g = parseFloat(this.grossAmount)
    return isNaN(g) ? '0.00' : (g * 0.20).toFixed(2)
  }
}
