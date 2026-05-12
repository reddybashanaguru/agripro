package domain

import "github.com/shopspring/decimal"

// PlatformMetrics is a snapshot of aggregate KPIs for the Investor Command Center.
// All values are computed from the live database — no caching layer.
type PlatformMetrics struct {
	FarmerCount      int             `json:"farmer_count"`
	PlotCount        int             `json:"plot_count"`
	TransactionCount int             `json:"transaction_count"`
	TotalDisbursed   decimal.Decimal `json:"total_disbursed"`
	TotalNDVIAlerts  int             `json:"total_ndvi_alerts"`
	TotalProofRecords int            `json:"total_proof_records"`
}
