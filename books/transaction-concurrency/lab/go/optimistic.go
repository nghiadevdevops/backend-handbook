package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DepositOptimistic is compare-and-set on the `ver` column (chapter 7). No transaction and
// no lock: UPDATE ... WHERE ver = $read. 0 rows affected means someone wrote first.
// pause widens the race window for the demo. Returns the number of tries.
func DepositOptimistic(ctx context.Context, pool *pgxpool.Pool, id, amount, maxTries int, pause time.Duration) (int, error) {
	for try := 1; try <= maxTries; try++ {
		var bal, ver int
		if err := pool.QueryRow(ctx, `SELECT bal, ver FROM acct WHERE id = $1`, id).Scan(&bal, &ver); err != nil {
			return try, fmt.Errorf("read account %d: %w", id, err)
		}
		time.Sleep(pause)
		tag, err := pool.Exec(ctx,
			`UPDATE acct SET bal = $1, ver = ver + 1 WHERE id = $2 AND ver = $3`, bal+amount, id, ver)
		if err != nil {
			return try, err
		}
		if tag.RowsAffected() == 1 {
			return try, nil
		}
		time.Sleep(backoff(try))
	}
	return maxTries, errors.New("version conflict, out of tries")
}
