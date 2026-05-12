package domain

import (
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
)

// GeoJSONPolygon is the domain value object for land boundaries.
// Always WGS84 (SRID 4326). Coordinates are [longitude, latitude] per GeoJSON spec.
type GeoJSONPolygon struct {
	Type        string        `json:"type"`
	Coordinates [][][]float64 `json:"coordinates"`
}

// Validate enforces geometry rules before any DB write.
func (g *GeoJSONPolygon) Validate() error {
	if g.Type != "Polygon" {
		return ErrValidation("geometry type must be 'Polygon'")
	}
	if len(g.Coordinates) == 0 {
		return ErrValidation("polygon must have at least one ring (exterior boundary)")
	}
	ring := g.Coordinates[0]
	if len(ring) < 4 {
		return ErrValidation("polygon ring must have at least 4 coordinate pairs (3 unique + closure)")
	}
	// Verify ring is closed: first point == last point
	first, last := ring[0], ring[len(ring)-1]
	if first[0] != last[0] || first[1] != last[1] {
		return ErrValidation("polygon ring must be closed: first coordinate must equal last coordinate")
	}
	// Validate all coordinates are valid WGS84
	for i, coord := range ring {
		if len(coord) < 2 {
			return ErrValidation(fmt.Sprintf("coordinate[%d] must have at least 2 values [lon, lat]", i))
		}
		lon, lat := coord[0], coord[1]
		if lon < -180 || lon > 180 {
			return ErrValidation(fmt.Sprintf("coordinate[%d]: longitude %.6f out of range [-180, 180]", i, lon))
		}
		if lat < -90 || lat > 90 {
			return ErrValidation(fmt.Sprintf("coordinate[%d]: latitude %.6f out of range [-90, 90]", i, lat))
		}
		// Rough India bounding box guard — prevent clearly invalid plots
		if lon < 67.0 || lon > 98.0 || lat < 6.0 || lat > 38.0 {
			return ErrValidation(fmt.Sprintf(
				"coordinate[%d]: (%.6f, %.6f) is outside India bounding box", i, lon, lat))
		}
	}
	return nil
}

// ApproxAreaAcres estimates area using the shoelace formula on WGS84 coordinates.
// This is a client-side estimate only — the authoritative value comes from PostGIS ST_Area.
func (g *GeoJSONPolygon) ApproxAreaAcres() float64 {
	if len(g.Coordinates) == 0 {
		return 0
	}
	ring := g.Coordinates[0]
	if len(ring) < 3 {
		return 0
	}
	// Use spherical excess formula approximation
	// Reference latitude for meter conversion
	refLat := ring[0][1] * math.Pi / 180
	latM := 111132.92 - 559.82*math.Cos(2*refLat) + 1.175*math.Cos(4*refLat)
	lonM := 111412.84*math.Cos(refLat) - 93.5*math.Cos(3*refLat)

	var area float64
	n := len(ring)
	for i := 0; i < n-1; i++ {
		x1 := ring[i][0] * lonM
		y1 := ring[i][1] * latM
		x2 := ring[i+1][0] * lonM
		y2 := ring[i+1][1] * latM
		area += x1*y2 - x2*y1
	}
	sqMeters := math.Abs(area) / 2
	return sqMeters / 4046.8564224 // sq meters to acres
}

// ─────────────────────────────────────────────────────────────────────
// ENTITY
// ─────────────────────────────────────────────────────────────────────

type LandPlot struct {
	ID           uuid.UUID
	FarmerID     uuid.UUID
	PlotName     string
	Geometry     GeoJSONPolygon
	AreaSqM      float64 // computed by PostGIS ST_Area
	AreaAcres    float64 // computed by PostGIS
	SurveyNumber string
	District     string
	State        string
	SoilType     string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    *time.Time
	LastSyncedAt *time.Time
}

func (p *LandPlot) IsActive() bool { return p.DeletedAt == nil }

// GPSVerificationResult is returned by the GPS-in-polygon check (Step 6 foundation).
type GPSVerificationResult struct {
	PlotID      uuid.UUID
	Longitude   float64
	Latitude    float64
	IsInside    bool
	DistanceM   float64 // distance to boundary if outside
	PlotAreaAcres float64
}
