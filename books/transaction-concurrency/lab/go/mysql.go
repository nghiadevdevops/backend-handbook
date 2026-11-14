package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/go-sql-driver/mysql"
)

// IsMySQLRetryable: 1213 (deadlock, also what SERIALIZABLE conflicts produce) and 1205 (lock wait timeout).
func IsMySQLRetryable(err error) bool {
	var me *mysql.MySQLError
	return errors.As(err, &me) && (me.Number == 1213 || me.Number == 1205)
}

// RunTxMySQL: database/sql sends the isolation level for this transaction only
// (SET TRANSACTION ... right before START TRANSACTION), so the driver handles the MySQL ordering quirk.
func RunTxMySQL(ctx context.Context, db *sql.DB, iso sql.IsolationLevel, maxAttempts int, fn func(tx *sql.Tx) error) (int, error) {
	for attempt := 1; ; attempt++ {
		err := func() error {
			tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: iso})
			if err != nil {
				return err
			}
			if err := fn(tx); err != nil {
				_ = tx.Rollback()
				return err
			}
			return tx.Commit()
		}()
		if err == nil {
			return attempt, nil
		}
		if !IsMySQLRetryable(err) || attempt >= maxAttempts {
			return attempt, err
		}
		time.Sleep(backoff(attempt))
	}
}

func demoMySQL(ctx context.Context, dsn string) error {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	for _, q := range []string{
		`DROP TABLE IF EXISTS acct`,
		`CREATE TABLE acct(id INT PRIMARY KEY, bal INT, ver INT DEFAULT 0)`,
		`INSERT INTO acct VALUES (1,100,0)`,
	} {
		if _, err := db.ExecContext(ctx, q); err != nil {
			return err
		}
	}
	// Both transactions are SERIALIZABLE: both read (shared lock), both update -> one gets 1213.
	var wg sync.WaitGroup
	for _, amt := range []int{10, 20} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			n, err := RunTxMySQL(ctx, db, sql.LevelSerializable, 5, func(tx *sql.Tx) error {
				var bal int
				if err := tx.QueryRowContext(ctx, `SELECT bal FROM acct WHERE id=1`).Scan(&bal); err != nil {
					return err
				}
				time.Sleep(300 * time.Millisecond)
				_, err := tx.ExecContext(ctx, `UPDATE acct SET bal=? WHERE id=1`, bal+amt)
				return err
			})
			fmt.Printf("mysql deposit %+d: attempts=%d err=%v\n", amt, n, err)
		}()
	}
	wg.Wait()
	var bal int
	if err := db.QueryRowContext(ctx, `SELECT bal FROM acct WHERE id=1`).Scan(&bal); err != nil {
		return err
	}
	fmt.Printf("mysql final balance = %d (expected 130)\n", bal)
	return nil
}
