package main

import (
	"context"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func must(err error) {
	if err != nil {
		fmt.Println("FATAL:", err)
		os.Exit(1)
	}
}

func resetAcct(ctx context.Context, pool *pgxpool.Pool) {
	_, err := pool.Exec(ctx, `DROP TABLE IF EXISTS acct; CREATE TABLE acct(id int PRIMARY KEY, bal int, ver int DEFAULT 0);
		INSERT INTO acct VALUES (1,100,0),(2,100,0)`)
	must(err)
}

func balance(ctx context.Context, pool *pgxpool.Pool, id int) int {
	var b int
	must(pool.QueryRow(ctx, `SELECT bal FROM acct WHERE id=$1`, id).Scan(&b))
	return b
}

// both runs fn(amount) for 10 and 20 concurrently; the second starts 100ms after the first.
func both(fn func(amt int)) {
	var wg sync.WaitGroup
	for i, amt := range []int{10, 20} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			time.Sleep(time.Duration(i) * 100 * time.Millisecond)
			fn(amt)
		}()
	}
	wg.Wait()
}

// readThenWrite is the buggy shape: read into a Go variable, add, write back.
func readThenWrite(ctx context.Context, pool *pgxpool.Pool, iso pgx.TxIsoLevel, lock string, amt int, retries int) (int, error) {
	return RunTx(ctx, pool, iso, retries, func(tx pgx.Tx) error {
		var bal int
		if err := tx.QueryRow(ctx, `SELECT bal FROM acct WHERE id=1`+lock).Scan(&bal); err != nil {
			return err
		}
		time.Sleep(300 * time.Millisecond)
		_, err := tx.Exec(ctx, `UPDATE acct SET bal=$1 WHERE id=1`, bal+amt)
		return err
	})
}

func main() {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("PG_DSN"))
	must(err)
	defer pool.Close()
	var v string
	must(pool.QueryRow(ctx, `SELECT version()`).Scan(&v))
	fmt.Println(v)

	fmt.Println("\n== 1. lost update, READ COMMITTED, plain SELECT (expected 130)")
	resetAcct(ctx, pool)
	both(func(amt int) { readThenWrite(ctx, pool, pgx.ReadCommitted, "", amt, 1) })
	fmt.Println("final balance =", balance(ctx, pool, 1))

	fmt.Println("\n== 2. SELECT ... FOR UPDATE")
	resetAcct(ctx, pool)
	both(func(amt int) {
		n, err := readThenWrite(ctx, pool, pgx.ReadCommitted, " FOR UPDATE", amt, 1)
		fmt.Printf("deposit %+d: attempts=%d err=%v\n", amt, n, err)
	})
	fmt.Println("final balance =", balance(ctx, pool, 1))

	fmt.Println("\n== 3. optimistic locking with a version column")
	resetAcct(ctx, pool)
	both(func(amt int) {
		n, err := DepositOptimistic(ctx, pool, 1, amt, 5, 300*time.Millisecond)
		fmt.Printf("deposit %+d: tries=%d err=%v\n", amt, n, err)
	})
	var ver int
	must(pool.QueryRow(ctx, `SELECT ver FROM acct WHERE id=1`).Scan(&ver))
	fmt.Printf("final balance = %d, ver = %d\n", balance(ctx, pool, 1), ver)

	fmt.Println("\n== 4. SERIALIZABLE + retry on 40001")
	resetAcct(ctx, pool)
	both(func(amt int) {
		n, err := readThenWrite(ctx, pool, pgx.Serializable, "", amt, 5)
		fmt.Printf("deposit %+d: attempts=%d err=%v\n", amt, n, err)
	})
	fmt.Println("final balance =", balance(ctx, pool, 1))

	fmt.Println("\n== 4b. SERIALIZABLE without retry (maxAttempts=1)")
	resetAcct(ctx, pool)
	both(func(amt int) {
		_, err := readThenWrite(ctx, pool, pgx.Serializable, "", amt, 1)
		fmt.Printf("deposit %+d: err=%v\n", amt, err)
	})
	fmt.Println("final balance =", balance(ctx, pool, 1), "(the failed deposit is not applied, no silent corruption)")

	var wg sync.WaitGroup
	fmt.Println("\n== 5. opposite transfers, unordered locks -> deadlock 40P01, retried")
	resetAcct(ctx, pool)
	for _, p := range [][2]int{{1, 2}, {2, 1}} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			n, err := TransferUnordered(ctx, pool, p[0], p[1], 10, 300*time.Millisecond)
			fmt.Printf("transfer %d->%d: attempts=%d err=%v\n", p[0], p[1], n, err)
		}()
	}
	wg.Wait()
	fmt.Println("total =", balance(ctx, pool, 1)+balance(ctx, pool, 2), "(expected 200)")

	fmt.Println("\n== 6. opposite transfers, ordered locks -> no deadlock")
	resetAcct(ctx, pool)
	for _, p := range [][2]int{{1, 2}, {2, 1}} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			n, err := Transfer(ctx, pool, p[0], p[1], 10, 300*time.Millisecond)
			fmt.Printf("transfer %d->%d: attempts=%d err=%v\n", p[0], p[1], n, err)
		}()
	}
	wg.Wait()
	fmt.Println("total =", balance(ctx, pool, 1)+balance(ctx, pool, 2), "(expected 200)")

	fmt.Println("\n== 7. job claimer, 3 workers x 2 jobs of 6, SKIP LOCKED")
	_, err = pool.Exec(ctx, `DROP TABLE IF EXISTS jobs; CREATE TABLE jobs(id serial PRIMARY KEY, state text NOT NULL DEFAULT 'new', worker text);
		INSERT INTO jobs(state) SELECT 'new' FROM generate_series(1,6)`)
	must(err)
	for _, w := range []string{"W1", "W2", "W3"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			ids, err := Claim(ctx, pool, w, 2, 500*time.Millisecond)
			fmt.Printf("%s claimed %v err=%v\n", w, ids, err)
		}()
	}
	wg.Wait()
	var running, distinct int
	must(pool.QueryRow(ctx, `SELECT count(*) FILTER (WHERE state='running'), count(DISTINCT worker) FROM jobs`).Scan(&running, &distinct))
	fmt.Printf("running=%d workers=%d (expected 6 and 3)\n", running, distinct)

	if dsn := os.Getenv("MYSQL_DSN"); dsn != "" {
		fmt.Println("\n== 8. MySQL: SERIALIZABLE + retry on 1213")
		must(demoMySQL(ctx, dsn))
	}
}
