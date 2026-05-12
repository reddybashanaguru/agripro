import { Model } from '@nozbe/watermelondb'
import { field, date, readonly, relation } from '@nozbe/watermelondb/decorators'

export default class LandPlot extends Model {
  static table = 'land_plots'
  static associations = {
    farmers: { type: 'belongs_to', key: 'farmer_id' },
  }

  @field('server_id')       serverId
  @field('farmer_id')       farmerId
  @field('farmer_server_id') farmerServerId
  @field('plot_name')       plotName
  @field('geom_json')       geomJson      // GeoJSON string — parsed as needed
  @field('area_acres')      areaAcres
  @field('survey_number')   surveyNumber
  @field('district')        district
  @field('state')           state
  @field('soil_type')       soilType
  @field('is_deleted')      isDeleted

  @readonly @date('created_at') createdAt
  @date('updated_at')           updatedAt
  @date('last_synced_at')       lastSyncedAt

  @relation('farmers', 'farmer_id') farmer

  get geometry() {
    try { return JSON.parse(this.geomJson) }
    catch { return null }
  }

  get areaAcresFormatted() {
    if (!this.areaAcres) return '—'
    return `${Number(this.areaAcres).toFixed(2)} acres`
  }
}
