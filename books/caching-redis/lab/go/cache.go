package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"math"
	mrand "math/rand/v2"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/valkey-io/valkey-go"
)

// ---- Database: every real query writes a row into query_log ----

type DB struct {
	Pool  *pgxpool.Pool
	Sleep float64 // seconds, simulates a heavy query via pg_sleep
}

// Load returns "name|price". The data-modifying CTE always runs, so
// SELECT count(*) FROM query_log is the number of real queries.
func (d *DB) Load(ctx context.Context, id int, tag string) (string, error) {
	var v string
	err := d.Pool.QueryRow(ctx, `
WITH i AS (INSERT INTO query_log(tag) VALUES ($1) RETURNING 1)
SELECT p.name||'|'||p.price FROM products p, pg_sleep($2::float8) WHERE p.id=$3`,
		tag, d.Sleep, id).Scan(&v)
	return v, err
}

func (d *DB) QueryCount(ctx context.Context) (n int, err error) {
	err = d.Pool.QueryRow(ctx, `SELECT count(*) FROM query_log`).Scan(&n)
	return
}

// ---- Cache: thin wrapper over valkey-go ----

type Cache struct{ C valkey.Client }

func NewCache(addr string) (*Cache, error) {
	c, err := valkey.NewClient(valkey.ClientOption{
		InitAddress:      []string{addr},
		DisableCache:     true, // no client-side caching tracking in this lab
		ConnWriteTimeout: 5 * time.Second,
	})
	return &Cache{C: c}, err
}

// Get returns ok=false on a miss.
func (c *Cache) Get(ctx context.Context, key string) (string, bool, error) {
	s, err := c.C.Do(ctx, c.C.B().Get().Key(key).Build()).ToString()
	if valkey.IsValkeyNil(err) {
		return "", false, nil
	}
	return s, err == nil, err
}

func (c *Cache) SetEX(ctx context.Context, key, val string, ttl time.Duration) error {
	return c.C.Do(ctx, c.C.B().Set().Key(key).Value(val).PxMilliseconds(ttl.Milliseconds()).Build()).Error()
}

func (c *Cache) Del(ctx context.Context, keys ...string) error {
	return c.C.Do(ctx, c.C.B().Del().Key(keys...).Build()).Error()
}

// ---- Distributed lock: SET NX PX with a random token, safe release ----

// Works on both Valkey and Redis. On Valkey >= 9.0 `DELIFEQ key token` does the same.
var unlockScript = valkey.NewLuaScript(
	`if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`)

func (c *Cache) TryLock(ctx context.Context, key string, ttl time.Duration) (token string, ok bool, err error) {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	token = hex.EncodeToString(b)
	err = c.C.Do(ctx, c.C.B().Set().Key(key).Value(token).Nx().PxMilliseconds(ttl.Milliseconds()).Build()).Error()
	if valkey.IsValkeyNil(err) {
		return "", false, nil // somebody else holds it
	}
	return token, err == nil, err
}

// Unlock deletes the lock only when we still own it. Returns true if deleted.
func (c *Cache) Unlock(ctx context.Context, key, token string) (bool, error) {
	n, err := unlockScript.Exec(ctx, c.C, []string{key}, []string{token}).AsInt64()
	return n == 1, err
}

// ---- XFetch: probabilistic early expiration (Vattani et al., 2015) ----

type xentry struct {
	V      string  `json:"v"`
	Delta  float64 `json:"delta"`  // seconds the last recompute took
	Expiry float64 `json:"expiry"` // logical expiry, unix seconds
}

func unixf(t time.Time) float64 { return float64(t.UnixNano()) / 1e9 }

// XFetch returns the value and whether this call recomputed it.
func (c *Cache) XFetch(ctx context.Context, key string, ttl time.Duration, beta float64,
	recompute func(context.Context) (string, error)) (string, bool, error) {
	if raw, ok, err := c.Get(ctx, key); err != nil {
		return "", false, err
	} else if ok {
		var e xentry
		if json.Unmarshal([]byte(raw), &e) == nil {
			r := 1 - mrand.Float64() // (0,1], so -ln(r) >= 0
			if unixf(time.Now())-e.Delta*beta*math.Log(r) < e.Expiry {
				return e.V, false, nil
			}
		}
	}
	t0 := time.Now()
	v, err := recompute(ctx)
	if err != nil {
		return "", true, err
	}
	e := xentry{V: v, Delta: time.Since(t0).Seconds(), Expiry: unixf(time.Now().Add(ttl))}
	b, _ := json.Marshal(e)
	// physical TTL a bit longer than the logical expiry
	return v, true, c.SetEX(ctx, key, string(b), ttl+5*time.Second)
}
