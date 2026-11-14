package main

import (
	"context"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/singleflight"
)

// ProductRepo is cache-aside + singleflight over pgx.
type ProductRepo struct {
	DB         *DB
	Cache      *Cache
	group      singleflight.Group
	Hits, Miss atomic.Int64
}

func (r *ProductRepo) Find(ctx context.Context, id int) (string, error) {
	key := "product:" + strconv.Itoa(id)
	if v, ok, err := r.Cache.Get(ctx, key); err != nil {
		return "", err
	} else if ok {
		r.Hits.Add(1)
		return v, nil
	}
	r.Miss.Add(1)
	v, err, _ := r.group.Do(key, func() (any, error) {
		s, err := r.DB.Load(ctx, id, "repo")
		if err != nil {
			return "", err
		}
		return s, r.Cache.SetEX(ctx, key, s, 60*time.Second)
	})
	s, _ := v.(string)
	return s, err
}

// UpdatePrice writes the DB in a transaction, then deletes the key AFTER commit.
func (r *ProductRepo) UpdatePrice(ctx context.Context, id int, price string) error {
	err := pgx.BeginFunc(ctx, r.DB.Pool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `UPDATE products SET price=$1, updated_at=now() WHERE id=$2`, price, id)
		return err
	})
	if err != nil {
		return err
	}
	return r.Cache.Del(ctx, "product:"+strconv.Itoa(id))
}
