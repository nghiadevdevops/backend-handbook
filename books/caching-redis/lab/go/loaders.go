package main

import (
	"context"
	"fmt"
	"time"

	"golang.org/x/sync/singleflight"
)

// Loader fetches product 42 using one of the protection modes.
type Loader struct {
	DB    *DB
	Cache *Cache
	Group singleflight.Group
	Mode  string // naive | sf | lock | both
}

const hotKey = "product:42"

func (l *Loader) loadAndSet(ctx context.Context, key string) (string, error) {
	v, err := l.DB.Load(ctx, 42, l.Mode)
	if err != nil {
		return "", err
	}
	return v, l.Cache.SetEX(ctx, key, v, 60*time.Second)
}

// withLock: one process wins SET NX PX, the rest poll the cache.
func (l *Loader) withLock(ctx context.Context, key string) (string, error) {
	lk := "lock:" + key
	tok, ok, err := l.Cache.TryLock(ctx, lk, 5*time.Second)
	if err != nil {
		return "", err
	}
	if ok {
		defer l.Cache.Unlock(ctx, lk, tok)
		if v, hit, _ := l.Cache.Get(ctx, key); hit { // double-check after taking the lock
			return v, nil
		}
		return l.loadAndSet(ctx, key)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
		if v, hit, _ := l.Cache.Get(ctx, key); hit {
			return v, nil
		}
	}
	return "", fmt.Errorf("timed out waiting for %s", lk)
}

func (l *Loader) Get(ctx context.Context, key string) (string, error) {
	if v, hit, err := l.Cache.Get(ctx, key); err != nil || hit {
		return v, err
	}
	switch l.Mode {
	case "naive":
		return l.loadAndSet(ctx, key)
	case "sf": // in-process coalescing only
		v, err, _ := l.Group.Do(key, func() (any, error) { return l.loadAndSet(ctx, key) })
		s, _ := v.(string)
		return s, err
	case "lock": // cross-process lock only
		return l.withLock(ctx, key)
	case "both": // singleflight inside the process, lock across processes
		v, err, _ := l.Group.Do(key, func() (any, error) { return l.withLock(ctx, key) })
		s, _ := v.(string)
		return s, err
	}
	return "", fmt.Errorf("unknown mode %q", l.Mode)
}
