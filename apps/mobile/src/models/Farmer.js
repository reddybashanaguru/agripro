import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'

export default class Farmer extends Model {
  static table = 'farmers'

  @field('server_id')    serverId     // server UUID — null until first sync
  @field('phone')        phone
  @field('name')         name
  @field('kyc_status')   kycStatus    // PENDING | VERIFIED | REJECTED
  @field('fpo_id')       fpoId
  @field('is_deleted')   isDeleted

  @readonly @date('created_at') createdAt
  @date('updated_at')           updatedAt
  @date('last_synced_at')       lastSyncedAt

  get isVerified() { return this.kycStatus === 'VERIFIED' }
  get isPending()  { return this.kycStatus === 'PENDING' }
  get canReceivePayout() { return this.isVerified && !this.isDeleted }
}
