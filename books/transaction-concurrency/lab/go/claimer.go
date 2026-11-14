package main

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Claim takes up to limit 'new' jobs with FOR UPDATE SKIP LOCKED (chapter 9). Rows locked
// by another worker are skipped instead of waited for. hold keeps the transaction open
// (demo only) so concurrent workers really overlap.
func Claim(ctx context.Context, pool *pgxpool.Pool, worker string, limit int, hold time.Duration) ([]int, error) {
	var ids []int
	err := pgx.BeginTxFunc(ctx, pool, pgx.TxOptions{}, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT id FROM jobs WHERE state = 'new' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, limit)
		if err != nil {
			return err
		}
		ids, err = pgx.CollectRows(rows, pgx.RowTo[int])
		if err != nil {
			return err
		}
		time.Sleep(hold)
		if len(ids) == 0 {
			return nil
		}
		_, err = tx.Exec(ctx, `UPDATE jobs SET state = 'running', worker = $1 WHERE id = ANY($2)`, worker, ids)
		return err
	})
	return ids, err
}
