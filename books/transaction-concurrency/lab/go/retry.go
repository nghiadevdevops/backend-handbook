package main

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// IsRetryable: SQLSTATE 40001 (serialization failure) or 40P01 (deadlock detected).
// 55P03 (lock_timeout) is intentionally NOT retried here.
func IsRetryable(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "40001" || pgErr.Code == "40P01"
	}
	return false
}

func backoff(attempt int) time.Duration {
	max := 20 * time.Millisecond * time.Duration(attempt)
	return time.Duration(rand.Int64N(int64(max))) + time.Millisecond
}

// RunTx runs fn in a transaction with the given isolation level and retries the WHOLE
// transaction on 40001/40P01. fn must not have side effects outside the DB.
// It returns the number of attempts used.
func RunTx(ctx context.Context, pool *pgxpool.Pool, iso pgx.TxIsoLevel, maxAttempts int, fn func(tx pgx.Tx) error) (int, error) {
	for attempt := 1; ; attempt++ {
		err := pgx.BeginTxFunc(ctx, pool, pgx.TxOptions{IsoLevel: iso}, fn)
		if err == nil {
			return attempt, nil
		}
		if !IsRetryable(err) || attempt >= maxAttempts {
			return attempt, fmt.Errorf("after %d attempts: %w", attempt, err)
		}
		select {
		case <-time.After(backoff(attempt)):
		case <-ctx.Done():
			return attempt, ctx.Err()
		}
	}
}
