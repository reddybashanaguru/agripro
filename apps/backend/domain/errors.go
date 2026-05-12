package domain

import (
	"errors"
	"fmt"
	"net/http"
)

// ErrorCode is a machine-readable error identifier for API consumers.
type ErrorCode string

const (
	ErrCodeNotFound           ErrorCode = "NOT_FOUND"
	ErrCodeConflict           ErrorCode = "CONFLICT"
	ErrCodeValidation         ErrorCode = "VALIDATION_ERROR"
	ErrCodeInsufficientFunds  ErrorCode = "INSUFFICIENT_FUNDS"
	ErrCodeMathViolation      ErrorCode = "MATH_VIOLATION"
	ErrCodeIdempotencyConflict ErrorCode = "IDEMPOTENCY_CONFLICT"
	ErrCodeUnauthorized       ErrorCode = "UNAUTHORIZED"
	ErrCodeForbidden          ErrorCode = "FORBIDDEN"
	ErrCodeInternal           ErrorCode = "INTERNAL_ERROR"
	ErrCodeDoubleEntryViolation ErrorCode = "DOUBLE_ENTRY_VIOLATION"
)

// DomainError carries a code, a user-facing message, and an optional cause.
// It maps cleanly to HTTP status codes without importing net/http in the domain.
type DomainError struct {
	Code    ErrorCode
	Message string
	Cause   error
}

func (e *DomainError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("[%s] %s: %v", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

func (e *DomainError) Unwrap() error { return e.Cause }

// HTTPStatus maps domain error codes to HTTP status codes.
// Kept here so the handler layer can translate without knowing all codes.
func (e *DomainError) HTTPStatus() int {
	switch e.Code {
	case ErrCodeNotFound:
		return http.StatusNotFound
	case ErrCodeConflict, ErrCodeIdempotencyConflict:
		return http.StatusConflict
	case ErrCodeValidation, ErrCodeMathViolation, ErrCodeDoubleEntryViolation:
		return http.StatusUnprocessableEntity
	case ErrCodeInsufficientFunds:
		return http.StatusPaymentRequired
	case ErrCodeUnauthorized:
		return http.StatusUnauthorized
	case ErrCodeForbidden:
		return http.StatusForbidden
	default:
		return http.StatusInternalServerError
	}
}

// Constructors — use these instead of &DomainError{} directly.

func ErrNotFound(entity, id string) *DomainError {
	return &DomainError{Code: ErrCodeNotFound, Message: fmt.Sprintf("%s %q not found", entity, id)}
}

func ErrValidation(msg string) *DomainError {
	return &DomainError{Code: ErrCodeValidation, Message: msg}
}

func ErrMathViolation(msg string) *DomainError {
	return &DomainError{Code: ErrCodeMathViolation, Message: msg}
}

func ErrDoubleEntry(msg string) *DomainError {
	return &DomainError{Code: ErrCodeDoubleEntryViolation, Message: msg}
}

func ErrIdempotencyConflict(key string) *DomainError {
	return &DomainError{
		Code:    ErrCodeIdempotencyConflict,
		Message: fmt.Sprintf("idempotency key %q already used", key),
	}
}

func ErrInternal(cause error) *DomainError {
	return &DomainError{Code: ErrCodeInternal, Message: "internal server error", Cause: cause}
}

// AsDomainError extracts a *DomainError from an error chain.
func AsDomainError(err error) (*DomainError, bool) {
	var de *DomainError
	return de, errors.As(err, &de)
}
