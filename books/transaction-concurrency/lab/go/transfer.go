package main

import (
	"context"
	"errors"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrInsufficient = errors.New("insufficient balance")

// Transfer locks both rows in ascending id order (one SELECT ... ORDER BY id FOR UPDATE),
// so opposite transfers never deadlock (chapter 6). pause only widens the race window in the demo.
func Transfer(ctx context.Context, pool *pgxpool.Pool, from, to, amount int, pause time.Duration) (int, error) {
	if from == to || amount <= 0 {
		return 0, errors.New("invalid arguments")
	}
	return RunTx(ctx, pool, pgx.ReadCommitted, 5, func(tx pgx.Tx) error {
		ids := []int{from, to}
		slices.Sort(ids)
		rows, err := tx.Query(ctx, `SELECT id, bal FROM acct WHERE id = ANY($1) ORDER BY id FOR UPDATE`, ids)
		if err != nil {
			return err
		}
		bal := map[int]int{}
		for rows.Next() {
			var id, b int
			if err := rows.Scan(&id, &b); err != nil {
				return err
			}
			bal[id] = b
		}
		if err := rows.Err(); err != nil {
			return err
		}
		if bal[from] < amount {
			return ErrInsufficient
		}
		time.Sleep(pause)
		if _, err := tx.Exec(ctx, `UPDATE acct SET bal = bal - $1 WHERE id = $2`, amount, from); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE acct SET bal = bal + $1 WHERE id = $2`, amount, to)
		return err
	})
}

// TransferUnordered locks "from" first, then "to" (the classic deadlock). Demo only.
func TransferUnordered(ctx context.Context, pool *pgxpool.Pool, from, to, amount int, pause time.Duration) (int, error) {
	return RunTx(ctx, pool, pgx.ReadCommitted, 5, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE acct SET bal = bal - $1 WHERE id = $2`, amount, from); err != nil {
			return err
		}
		time.Sleep(pause)
		_, err := tx.Exec(ctx, `UPDATE acct SET bal = bal + $1 WHERE id = $2`, amount, to)
		return err
	})
}
