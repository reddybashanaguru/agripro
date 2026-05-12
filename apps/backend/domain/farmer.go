package domain

import (
	"time"

	"github.com/google/uuid"
)

type KYCStatus string

const (
	KYCPending  KYCStatus = "PENDING"
	KYCVerified KYCStatus = "VERIFIED"
	KYCRejected KYCStatus = "REJECTED"
)

type Farmer struct {
	ID           uuid.UUID
	Phone        string
	Name         string
	AadhaarHash  string // SHA-256 of Aadhaar — never raw
	KYCStatus    KYCStatus
	FPOID        *uuid.UUID
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    *time.Time
	LastSyncedAt *time.Time
}

func (f *Farmer) IsActive() bool { return f.DeletedAt == nil }

func (f *Farmer) CanReceivePayout() error {
	if !f.IsActive() {
		return ErrValidation("farmer account is deactivated")
	}
	if f.KYCStatus != KYCVerified {
		return ErrValidation("farmer KYC is not verified — cannot receive payout")
	}
	return nil
}
