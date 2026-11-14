// Stampede lab in Go. Commands: reset | startat <ms> | run | count | repo | steady | l1
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/maypok86/otter/v2"
)

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func connect(ctx context.Context, sleep float64, size int) (*DB, *Cache) {
	cfg, err := pgxpool.ParseConfig(env("DATABASE_URL", "postgres://postgres:lab@bookcheck-cache-pg/shop"))
	must(err)
	cfg.MaxConns = int32(size) + 1
	cfg.MinConns = int32(size) // warm the pool before the start barrier
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	must(err)
	c, err := NewCache(env("CACHE_ADDR", "bookcheck-cache-valkey:6379"))
	must(err)
	return &DB{Pool: pool, Sleep: sleep}, c
}

func main() {
	ctx := context.Background()
	if len(os.Args) < 2 {
		fmt.Println("usage: lab reset|startat|run|count|repo|steady|l1")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "startat": // print now+<ms> as unix ms, for the start barrier
		ms, _ := strconv.Atoi(os.Args[2])
		fmt.Println(time.Now().UnixMilli() + int64(ms))
	case "reset":
		db, c := connect(ctx, 0, 2)
		_, err := db.Pool.Exec(ctx, `TRUNCATE query_log`)
		must(err)
		must(c.Del(ctx, hotKey, "lock:"+hotKey))
	case "count":
		db, _ := connect(ctx, 0, 2)
		n, err := db.QueryCount(ctx)
		must(err)
		fmt.Println(n)
	case "run":
		runStampede(ctx, os.Args[2:])
	case "repo":
		runRepo(ctx)
	case "steady":
		runSteady(ctx, os.Args[2:])
	case "l1":
		runL1(ctx)
	}
}

// runStampede: n goroutines read the expired hot key at the same instant (-start, unix ms).
func runStampede(ctx context.Context, args []string) {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	mode := fs.String("mode", "naive", "naive|sf|lock|both")
	n := fs.Int("n", 100, "goroutines")
	start := fs.Int64("start", 0, "unix ms barrier")
	_ = fs.Parse(args)
	db, c := connect(ctx, 0.2, *n)
	l := &Loader{DB: db, Cache: c, Mode: *mode}
	var wg sync.WaitGroup
	lat := make([]time.Duration, *n)
	var fails atomic.Int64
	for i := 0; i < *n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			time.Sleep(time.Until(time.UnixMilli(*start)))
			t := time.Now()
			if _, err := l.Get(ctx, hotKey); err != nil {
				fails.Add(1)
				fmt.Fprintln(os.Stderr, "get:", err)
			}
			lat[i] = time.Since(t)
		}()
	}
	wg.Wait()
	sort.Slice(lat, func(a, b int) bool { return lat[a] < lat[b] })
	fmt.Printf("proc mode=%s goroutines=%d fails=%d p50=%dms max=%dms\n",
		*mode, *n, fails.Load(), lat[*n/2].Milliseconds(), lat[*n-1].Milliseconds())
}

// runRepo repeats the shell cache-aside lab: 200 reads over 10 products.
func runRepo(ctx context.Context) {
	db, c := connect(ctx, 0, 2)
	_, err := db.Pool.Exec(ctx, `TRUNCATE query_log`)
	must(err)
	ids := make([]string, 10)
	for i := range ids {
		ids[i] = "product:" + strconv.Itoa(i+1)
	}
	must(c.Del(ctx, ids...))
	r := &ProductRepo{DB: db, Cache: c}
	for i := 0; i < 200; i++ {
		_, err := r.Find(ctx, i%10+1)
		must(err)
	}
	n, _ := db.QueryCount(ctx)
	fmt.Printf("hit=%d miss=%d db_queries=%d\n", r.Hits.Load(), r.Miss.Load(), n)
	must(r.UpdatePrice(ctx, 3, "99"))
	v, err := r.Find(ctx, 3)
	must(err)
	n, _ = db.QueryCount(ctx)
	fmt.Printf("after update: %s db_queries=%d\n", v, n)
	must(c.Del(ctx, ids...))
	_, err = db.Pool.Exec(ctx, `UPDATE products SET price=5+id WHERE id=3`)
	must(err)
}

// runSteady: g goroutines read the hot key continuously. ttl vs xfetch.
func runSteady(ctx context.Context, args []string) {
	fs := flag.NewFlagSet("steady", flag.ExitOnError)
	mode := fs.String("mode", "ttl", "ttl|xfetch")
	g := fs.Int("g", 50, "goroutines")
	dur := fs.Duration("dur", 20*time.Second, "duration")
	ttl := fs.Duration("ttl", 3*time.Second, "logical ttl")
	_ = fs.Parse(args)
	db, c := connect(ctx, 0.2, *g)
	_, err := db.Pool.Exec(ctx, `TRUNCATE query_log`)
	must(err)
	must(c.Del(ctx, hotKey))
	var reads, slow atomic.Int64
	end := time.Now().Add(*dur)
	var wg sync.WaitGroup
	for i := 0; i < *g; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for time.Now().Before(end) {
				t := time.Now()
				var err error
				if *mode == "xfetch" {
					_, _, err = c.XFetch(ctx, hotKey, *ttl, 1.0, func(ctx context.Context) (string, error) {
						return db.Load(ctx, 42, "xfetch")
					})
				} else {
					var hit bool
					if _, hit, err = c.Get(ctx, hotKey); err == nil && !hit {
						var v string
						if v, err = db.Load(ctx, 42, "ttl"); err == nil {
							err = c.SetEX(ctx, hotKey, v, *ttl)
						}
					}
				}
				must(err)
				reads.Add(1)
				if time.Since(t) > 100*time.Millisecond {
					slow.Add(1) // the caller waited for a DB reload
				}
				time.Sleep(10 * time.Millisecond)
			}
		}()
	}
	wg.Wait()
	n, _ := db.QueryCount(ctx)
	fmt.Printf("mode=%s goroutines=%d dur=%s ttl=%s reads=%d db_queries=%d reads_that_waited=%d\n",
		*mode, *g, *dur, *ttl, reads.Load(), n, slow.Load())
}

// runL1: in-process otter cache (L1, 2s TTL) in front of Valkey (L2).
func runL1(ctx context.Context) {
	db, c := connect(ctx, 0, 2)
	_ = db
	must(c.SetEX(ctx, "cfg:site", "hello", time.Minute))
	l1 := otter.Must(&otter.Options[string, string]{
		MaximumSize:      10_000,
		ExpiryCalculator: otter.ExpiryWriting[string, string](2 * time.Second),
	})
	var l2 int
	read := func() string {
		if v, ok := l1.GetIfPresent("cfg:site"); ok {
			return v
		}
		v, _, err := c.Get(ctx, "cfg:site")
		must(err)
		l2++
		l1.Set("cfg:site", v)
		return v
	}
	for i := 0; i < 1000; i++ {
		read()
	}
	fmt.Printf("1000 reads in 0s window: valkey GETs=%d\n", l2)
	time.Sleep(2200 * time.Millisecond)
	for i := 0; i < 1000; i++ {
		read()
	}
	fmt.Printf("after L1 TTL (2s) expired, 1000 more reads: total valkey GETs=%d\n", l2)
	must(c.Del(ctx, "cfg:site"))
}
