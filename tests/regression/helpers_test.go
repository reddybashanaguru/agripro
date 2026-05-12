//go:build integration

package regression_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func openTestDB(t *testing.T) (*pgxpool.Pool, error) {
	t.Helper()
	return pgxpool.New(context.Background(), dbURL())
}
